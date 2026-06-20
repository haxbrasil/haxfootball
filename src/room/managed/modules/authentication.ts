import { api } from "@api/client";
import {
    createModule,
    Module,
    PlayerJoinData,
    PlayerJoinDataResponse,
} from "@core/module";
import { Room } from "@core/room";
import { COLOR } from "@common/general/color";
import { env } from "@env/room";
import { t } from "@lingui/core/macro";
import type {
    ResolveSessionInput,
    SessionAccount,
} from "@haxbrasil/haxfootball-api-sdk";
import type {
    PlayerSession,
    PlayerSessionStore,
} from "@room/shared/domain/player-sessions";
import { Team } from "@runtime/models";

type PreJoinSession =
    | {
          kind: "guest";
          playerId: string;
      }
    | {
          kind: "signed-in";
          account: SessionAccount;
          playerId: string;
          canonicalName: string;
      }
    | {
          kind: "password-required";
          account: SessionAccount;
          playerId: string;
      };

type SessionIdentityPlayer = Pick<
    PlayerJoinData,
    "id" | "name" | "auth" | "conn"
>;

type AuthenticationModuleOptions = {
    roomId?: string | undefined;
    downstreamModules: Module[];
    sessionStore: PlayerSessionStore;
};

type AuthenticationState = {
    sessionStore: PlayerSessionStore;
    preJoinSessions: Map<number, PreJoinSession>;
    renamingPlayerIds: Set<number>;
};

const SIGN_IN_TIMEOUT_MS = 30_000;

export function createAuthenticationModule({
    roomId,
    downstreamModules,
    sessionStore,
}: AuthenticationModuleOptions): Module {
    const state: AuthenticationState = {
        sessionStore,
        preJoinSessions: new Map(),
        renamingPlayerIds: new Set(),
    };
    const roomsWithAnnouncementFilter = new WeakSet<Room>();

    const installAnnouncementFilter = (room: Room) => {
        if (roomsWithAnnouncementFilter.has(room)) {
            return;
        }

        room.addAnnouncementRecipientFilter(
            (player) => !isAuthenticationPending(player.id, state),
        );

        roomsWithAnnouncementFilter.add(room);
    };

    return createModule()
        .onBeforePlayerJoin((_room, player) =>
            resolvePlayerBeforeJoin({
                state,
                player,
                roomId,
            }),
        )
        .onRoomLink((room) => {
            installAnnouncementFilter(room);
        })
        .onPlayerJoin((room, player) => {
            if (state.renamingPlayerIds.has(player.id)) {
                state.renamingPlayerIds.delete(player.id);
                return false;
            }

            installAnnouncementFilter(room);

            const preJoinSession = state.preJoinSessions.get(player.id);

            if (preJoinSession) {
                state.preJoinSessions.delete(player.id);
                void acceptPreResolvedPlayer({
                    state,
                    room,
                    playerId: player.id,
                    session: preJoinSession,
                    downstreamModules,
                }).catch((error) => {
                    console.error(
                        "Failed to accept pre-resolved player:",
                        error,
                    );
                });
                return false;
            }

            const token = Symbol(`player:${player.id}`);

            state.sessionStore.set(player.id, { kind: "resolving", token });

            void resolveJoinedPlayer({
                state,
                room,
                player,
                roomId,
                token,
                downstreamModules,
            }).catch((error) => {
                console.error("Failed to resolve player session:", error);
                const currentSession = state.sessionStore.get(player.id);

                if (
                    currentSession?.kind !== "resolving" ||
                    currentSession.token !== token
                ) {
                    return;
                }

                acceptGuest({
                    state,
                    room,
                    playerId: player.id,
                    backendPlayerId: `unavailable:${player.id}`,
                    downstreamModules,
                });
            });

            return false;
        })
        .onPlayerLeave((_room, player) => {
            if (state.renamingPlayerIds.has(player.id)) {
                return false;
            }

            const session = state.sessionStore.get(player.id);
            clearSessionTimeout(session);
            state.sessionStore.delete(player.id);

            return isAuthenticationPendingSession(session) ? false : undefined;
        })
        .onPlayerChat((room, player, password) => {
            const session = state.sessionStore.get(player.id);

            if (session?.kind === "resolving") {
                room.send({
                    message: t`🔐 Still checking your account. Please wait a moment.`,
                    color: COLOR.SYSTEM,
                    to: player.id,
                    sound: "notification",
                });
                return false;
            }

            if (session?.kind !== "signing-in") {
                return;
            }

            handlePasswordAttempt({
                state,
                room,
                player,
                roomId,
                password,
                downstreamModules,
            });

            return false;
        })
        .onBeforePlayerSendCommand((room, player, _command, rawMessage) => {
            const session = state.sessionStore.get(player.id);

            if (session?.kind === "resolving") {
                room.send({
                    message: t`🔐 Still checking your account. Please wait a moment.`,
                    color: COLOR.SYSTEM,
                    to: player.id,
                    sound: "notification",
                });
                return false;
            }

            if (session?.kind !== "signing-in") {
                return;
            }

            handlePasswordAttempt({
                state,
                room,
                player,
                roomId,
                password: rawMessage,
                downstreamModules,
            });

            return false;
        })
        .onBeforeOperation((room, operation) => {
            const actor = operation.byPlayer;

            if (actor && isAuthenticationPending(actor.id, state)) {
                if (operation.kind === "chat") {
                    handlePendingPlayerChatOperation({
                        state,
                        room,
                        player: actor,
                        message: operation.message,
                        roomId,
                        downstreamModules,
                    });
                }

                return false;
            }

            const movesPendingPlayerToSpectators =
                !actor &&
                operation.kind === "player-team" &&
                operation.message.team === Team.SPECTATORS;

            if (
                operation.kind !== "kick-ban" &&
                !movesPendingPlayerToSpectators &&
                operation.targetPlayers.some((target) =>
                    isAuthenticationPending(target.id, state),
                )
            ) {
                if (actor && operation.kind !== "input") {
                    room.send({
                        message: t`🔐 That player is signing in.`,
                        color: COLOR.WARNING,
                        to: actor.id,
                        sound: "notification",
                    });
                }

                return false;
            }

            return true;
        });
}

function handlePendingPlayerChatOperation({
    state,
    room,
    player,
    message,
    roomId,
    downstreamModules,
}: {
    state: AuthenticationState;
    room: Room;
    player: PlayerObject;
    message: unknown;
    roomId?: string | undefined;
    downstreamModules: Module[];
}): void {
    const session = state.sessionStore.get(player.id);
    const text = getChatOperationText(message);

    if (session?.kind === "resolving") {
        room.send({
            message: t`🔐 Still checking your account. Please wait a moment.`,
            color: COLOR.SYSTEM,
            to: player.id,
            sound: "notification",
        });
        return;
    }

    if (session?.kind !== "signing-in" || text === null) {
        return;
    }

    handlePasswordAttempt({
        state,
        room,
        player,
        roomId,
        password: text,
        downstreamModules,
    });
}

function getChatOperationText(message: unknown): string | null {
    if (!message || typeof message !== "object") {
        return null;
    }

    if (!("message" in message) || typeof message.message !== "string") {
        return null;
    }

    return message.message;
}

async function resolvePlayerBeforeJoin({
    state,
    player,
    roomId,
}: {
    state: AuthenticationState;
    player: PlayerJoinData;
    roomId?: string | undefined;
}): Promise<PlayerJoinDataResponse> {
    if (!roomId) {
        return;
    }

    try {
        const result = await api.sessions.resolve(
            createSessionIdentityFromJoinData(roomId, player),
        );

        if (!result.ok) {
            console.error("Failed to resolve player session:", result.error);
            state.preJoinSessions.set(player.id, {
                kind: "guest",
                playerId: `unavailable:${player.id}`,
            });
            return;
        }

        switch (result.data.status) {
            case "guest":
                state.preJoinSessions.set(player.id, {
                    kind: "guest",
                    playerId: result.data.playerId,
                });
                return;
            case "signed_in":
                state.preJoinSessions.set(player.id, {
                    kind: "signed-in",
                    account: result.data.account,
                    playerId: result.data.playerId,
                    canonicalName: result.data.canonicalName,
                });
                return { name: result.data.canonicalName };
            case "password_required":
                state.preJoinSessions.set(player.id, {
                    kind: "password-required",
                    account: result.data.account,
                    playerId: result.data.playerId,
                });
                return;
        }
    } catch (error) {
        console.error("Failed to resolve player session:", error);
        state.preJoinSessions.set(player.id, {
            kind: "guest",
            playerId: `unavailable:${player.id}`,
        });
        return;
    }
}

async function acceptPreResolvedPlayer({
    state,
    room,
    playerId,
    session,
    downstreamModules,
}: {
    state: AuthenticationState;
    room: Room;
    playerId: number;
    session: PreJoinSession;
    downstreamModules: Module[];
}): Promise<void> {
    switch (session.kind) {
        case "guest":
            acceptGuest({
                state,
                room,
                playerId,
                backendPlayerId: session.playerId,
                downstreamModules,
            });
            return;
        case "signed-in":
            await acceptSignedIn({
                state,
                room,
                playerId,
                account: session.account,
                backendPlayerId: session.playerId,
                canonicalName: session.canonicalName,
                downstreamModules,
            });
            return;
        case "password-required":
            requirePassword({
                state,
                room,
                playerId,
                account: session.account,
                backendPlayerId: session.playerId,
            });
            return;
    }
}

function handlePasswordAttempt({
    state,
    room,
    player,
    roomId,
    password,
    downstreamModules,
}: {
    state: AuthenticationState;
    room: Room;
    player: PlayerObject;
    roomId?: string | undefined;
    password: string;
    downstreamModules: Module[];
}): void {
    const trimmedPassword = password.trim();

    if (!trimmedPassword) {
        room.send({
            message: t`🔐 Type your password in chat to sign in.`,
            color: COLOR.SYSTEM,
            to: player.id,
            sound: "notification",
        });
        return;
    }

    void confirmPlayerPassword({
        state,
        room,
        player,
        roomId,
        password: trimmedPassword,
        downstreamModules,
    }).catch((error) => {
        console.error("Failed to confirm player session:", error);

        if (state.sessionStore.get(player.id)?.kind !== "signing-in") {
            return;
        }

        room.send({
            message: t`⚠️ Sign-in is unavailable right now. Try again in a moment.`,
            color: COLOR.WARNING,
            to: player.id,
            sound: "notification",
        });
    });
}

async function resolveJoinedPlayer({
    state,
    room,
    player,
    roomId,
    token,
    downstreamModules,
}: {
    state: AuthenticationState;
    room: Room;
    player: PlayerObject;
    roomId?: string | undefined;
    token: symbol;
    downstreamModules: Module[];
}): Promise<void> {
    if (!roomId) {
        acceptGuest({
            state,
            room,
            playerId: player.id,
            backendPlayerId: `local:${player.id}`,
            downstreamModules,
        });
        return;
    }

    const result = await api.sessions.resolve(
        createSessionIdentity(roomId, player),
    );

    const currentSession = state.sessionStore.get(player.id);

    if (
        currentSession?.kind !== "resolving" ||
        currentSession.token !== token
    ) {
        return;
    }

    if (!result.ok) {
        console.error("Failed to resolve player session:", result.error);
        acceptGuest({
            state,
            room,
            playerId: player.id,
            backendPlayerId: `unavailable:${player.id}`,
            downstreamModules,
        });
        return;
    }

    switch (result.data.status) {
        case "guest":
            acceptGuest({
                state,
                room,
                playerId: player.id,
                backendPlayerId: result.data.playerId,
                downstreamModules,
            });
            return;
        case "signed_in":
            await acceptSignedIn({
                state,
                room,
                playerId: player.id,
                account: result.data.account,
                backendPlayerId: result.data.playerId,
                canonicalName: result.data.canonicalName,
                downstreamModules,
            });
            return;
        case "password_required":
            requirePassword({
                state,
                room,
                playerId: player.id,
                account: result.data.account,
                backendPlayerId: result.data.playerId,
            });
            return;
    }
}

async function confirmPlayerPassword({
    state,
    room,
    player,
    roomId,
    password,
    downstreamModules,
}: {
    state: AuthenticationState;
    room: Room;
    player: PlayerObject;
    roomId?: string | undefined;
    password: string;
    downstreamModules: Module[];
}): Promise<void> {
    const session = state.sessionStore.get(player.id);

    if (session?.kind !== "signing-in") {
        return;
    }

    if (!roomId) {
        room.send({
            message: t`⚠️ Sign-in is unavailable in this room.`,
            color: COLOR.WARNING,
            to: player.id,
            sound: "notification",
        });
        return;
    }

    const result = await api.sessions.confirm({
        ...createSessionIdentity(roomId, player),
        password,
    });

    const currentSession = state.sessionStore.get(player.id);

    if (currentSession?.kind !== "signing-in") {
        return;
    }

    if (!result.ok) {
        console.error("Failed to confirm player session:", result.error);
        room.send({
            message: t`⚠️ Sign-in is unavailable right now. Try again in a moment.`,
            color: COLOR.WARNING,
            to: player.id,
            sound: "notification",
        });
        return;
    }

    if (!result.data.valid) {
        room.send({
            message: t`❌ Incorrect password. Try again.`,
            color: COLOR.ERROR,
            to: player.id,
            sound: "notification",
        });
        return;
    }

    clearSessionTimeout(currentSession);
    await acceptSignedIn({
        state,
        room,
        playerId: player.id,
        account: result.data.account,
        backendPlayerId: result.data.playerId,
        canonicalName: result.data.canonicalName,
        downstreamModules,
    });
}

function requirePassword({
    state,
    room,
    playerId,
    account,
    backendPlayerId,
}: {
    state: AuthenticationState;
    room: Room;
    playerId: number;
    account: SessionAccount;
    backendPlayerId: string;
}): void {
    if (!room.getPlayer(playerId)) {
        return;
    }

    const timeout = setTimeout(() => {
        const session = state.sessionStore.get(playerId);

        if (session?.kind !== "signing-in") {
            return;
        }

        state.sessionStore.delete(playerId);

        room.kick(playerId, t`Sign-in timed out.`);
    }, SIGN_IN_TIMEOUT_MS);

    state.sessionStore.set(playerId, {
        kind: "signing-in",
        account,
        playerId: backendPlayerId,
        timeout,
    });

    room.send({
        message: t`🔐 This name is registered. Type your password in chat to sign in.`,
        color: COLOR.SYSTEM,
        to: playerId,
        sound: "notification",
    });
}

function acceptGuest({
    state,
    room,
    playerId,
    backendPlayerId,
    downstreamModules,
}: {
    state: AuthenticationState;
    room: Room;
    playerId: number;
    backendPlayerId: string;
    downstreamModules: Module[];
}): void {
    if (!room.getPlayer(playerId)) {
        return;
    }

    state.sessionStore.set(playerId, {
        kind: "guest",
        playerId: backendPlayerId,
    });

    releasePlayerJoin(room, playerId, downstreamModules);

    if (!room.getPlayer(playerId)) {
        return;
    }

    room.send({
        message: t`🔐 You need to register before you can play. Register in our Discord: ${env.DISCORD_LINK}`,
        color: COLOR.SYSTEM,
        to: playerId,
        sound: "notification",
    });
}

async function acceptSignedIn({
    state,
    room,
    playerId,
    account,
    backendPlayerId,
    canonicalName,
    downstreamModules,
}: {
    state: AuthenticationState;
    room: Room;
    playerId: number;
    account: SessionAccount;
    backendPlayerId: string;
    canonicalName: string;
    downstreamModules: Module[];
}): Promise<void> {
    const player = room.getPlayer(playerId);

    if (!player) {
        return;
    }

    if (player.name !== canonicalName) {
        state.renamingPlayerIds.add(playerId);
        room.renamePlayer(player, canonicalName);
    }

    const permissions = await getAccountPermissions(account);

    if (!room.getPlayer(playerId)) {
        return;
    }

    state.sessionStore.set(playerId, {
        kind: "signed-in",
        account: {
            ...account,
            permissions,
        },
        playerId: backendPlayerId,
    });

    room.send({
        message: t`✅ Signed in as ${account.name}.`,
        color: COLOR.SUCCESS,
        to: playerId,
        sound: "notification",
    });

    releasePlayerJoin(room, playerId, downstreamModules);
}

async function getAccountPermissions(
    account: SessionAccount,
): Promise<readonly string[]> {
    const result = await api.accounts.get(account.uuid);

    if (!result.ok) {
        console.error("Failed to fetch account permissions:", result.error);
        return [];
    }

    return result.data.role.permissions;
}

function releasePlayerJoin(
    room: Room,
    playerId: number,
    downstreamModules: Module[],
): void {
    const player = room.getPlayer(playerId);

    if (!player) {
        return;
    }

    for (const module of downstreamModules) {
        if (module.call("onPlayerJoin", room, player) === false) {
            return;
        }
    }
}

function createSessionIdentity(
    roomId: string,
    player: PlayerObject,
): ResolveSessionInput {
    return createSessionIdentityFromJoinData(roomId, {
        id: player.id,
        name: player.name,
        auth: player.auth ?? null,
        conn: player.conn || null,
    });
}

function createSessionIdentityFromJoinData(
    roomId: string,
    player: SessionIdentityPlayer,
): ResolveSessionInput {
    return {
        roomId,
        roomPlayerId: player.id,
        name: player.name,
        auth: player.auth,
        conn: player.conn || null,
    };
}

function clearSessionTimeout(session: PlayerSession | null | undefined): void {
    if (session?.kind === "signing-in") {
        clearTimeout(session.timeout);
    }
}

function isAuthenticationPending(
    playerId: number,
    state: AuthenticationState,
): boolean {
    return isAuthenticationPendingSession(state.sessionStore.get(playerId));
}

function isAuthenticationPendingSession(
    session: PlayerSession | null | undefined,
): boolean {
    return session?.kind === "resolving" || session?.kind === "signing-in";
}
