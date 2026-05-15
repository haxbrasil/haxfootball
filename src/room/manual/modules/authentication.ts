import { api } from "@api/client";
import {
    createModule,
    Module,
    PlayerJoinData,
    PlayerJoinDataResponse,
} from "@core/module";
import { PlayerIdentity, Room } from "@core/room";
import { COLOR } from "@common/general/color";
import { t } from "@lingui/core/macro";
import type {
    ResolveSessionInput,
    SessionAccount,
} from "@haxbrasil/haxfootball-api-sdk";

type ResolvingSession = {
    kind: "resolving";
    token: symbol;
};

type SigningInSession = {
    kind: "signing-in";
    account: SessionAccount;
    playerId: string;
    identity: PlayerIdentity;
    timeout: ReturnType<typeof setTimeout>;
};

type SignedInSession = {
    kind: "signed-in";
    account: SessionAccount;
    playerId: string;
};

type GuestSession = {
    kind: "guest";
    playerId: string;
};

export type PlayerSession =
    | ResolvingSession
    | SigningInSession
    | SignedInSession
    | GuestSession;

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
          identity: PlayerIdentity;
      };

type SessionIdentityPlayer = Pick<
    PlayerJoinData,
    "id" | "name" | "auth" | "conn"
>;

type AuthenticationModuleOptions = {
    roomId?: string | undefined;
    downstreamModules: Module[];
};

const SIGN_IN_TIMEOUT_MS = 30_000;
const sessions = new Map<number, PlayerSession>();
const preJoinSessions = new Map<number, PreJoinSession>();
const renamingPlayerIds = new Set<number>();

export function getPlayerSession(playerId: number): PlayerSession | null {
    return sessions.get(playerId) ?? null;
}

export function getPlayerBackendId(playerId: number): string | null {
    const session = sessions.get(playerId);
    return session && session.kind !== "resolving" ? session.playerId : null;
}

export function createAuthenticationModule({
    roomId,
    downstreamModules,
}: AuthenticationModuleOptions): Module {
    const roomsWithAnnouncementFilter = new WeakSet<Room>();

    const installAnnouncementFilter = (room: Room) => {
        if (roomsWithAnnouncementFilter.has(room)) {
            return;
        }

        room.addAnnouncementRecipientFilter(
            (player) => !isAuthenticationPending(player.id),
        );

        roomsWithAnnouncementFilter.add(room);
    };

    return createModule()
        .onBeforePlayerJoin((_room, player) =>
            resolvePlayerBeforeJoin({
                player,
                roomId,
            }),
        )
        .onRoomLink((room) => {
            installAnnouncementFilter(room);
        })
        .onPlayerJoin((room, player) => {
            if (renamingPlayerIds.has(player.id)) {
                renamingPlayerIds.delete(player.id);
                return false;
            }

            installAnnouncementFilter(room);

            const preJoinSession = preJoinSessions.get(player.id);

            if (preJoinSession) {
                preJoinSessions.delete(player.id);
                acceptPreResolvedPlayer({
                    room,
                    playerId: player.id,
                    session: preJoinSession,
                    downstreamModules,
                });
                return false;
            }

            const token = Symbol(`player:${player.id}`);

            sessions.set(player.id, { kind: "resolving", token });

            void resolveJoinedPlayer({
                room,
                player,
                roomId,
                token,
                downstreamModules,
            }).catch((error) => {
                console.error("Failed to resolve player session:", error);
                const currentSession = sessions.get(player.id);

                if (
                    currentSession?.kind !== "resolving" ||
                    currentSession.token !== token
                ) {
                    return;
                }

                acceptGuest({
                    room,
                    playerId: player.id,
                    backendPlayerId: `unavailable:${player.id}`,
                    downstreamModules,
                });
            });

            return false;
        })
        .onPlayerLeave((_room, player) => {
            if (renamingPlayerIds.has(player.id)) {
                return false;
            }

            const session = sessions.get(player.id);
            clearSessionTimeout(session);
            sessions.delete(player.id);

            return isAuthenticationPendingSession(session) ? false : undefined;
        })
        .onPlayerChat((room, player, password) => {
            const session = sessions.get(player.id);

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
                room,
                player,
                roomId,
                password,
                downstreamModules,
            });

            return false;
        })
        .onBeforePlayerSendCommand((room, player, _command, rawMessage) => {
            const session = sessions.get(player.id);

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

            if (actor && isAuthenticationPending(actor.id)) {
                if (operation.kind === "chat") {
                    handlePendingPlayerChatOperation({
                        room,
                        player: actor,
                        message: operation.message,
                        roomId,
                        downstreamModules,
                    });
                }

                return false;
            }

            if (
                operation.kind !== "kick-ban" &&
                operation.targetPlayers.some((target) =>
                    isAuthenticationPending(target.id),
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
    room,
    player,
    message,
    roomId,
    downstreamModules,
}: {
    room: Room;
    player: PlayerObject;
    message: unknown;
    roomId?: string | undefined;
    downstreamModules: Module[];
}): void {
    const session = sessions.get(player.id);
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

    if (!("text" in message) || typeof message.text !== "string") {
        return null;
    }

    return message.text;
}

async function resolvePlayerBeforeJoin({
    player,
    roomId,
}: {
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
            preJoinSessions.set(player.id, {
                kind: "guest",
                playerId: `unavailable:${player.id}`,
            });
            return;
        }

        switch (result.data.status) {
            case "guest":
                preJoinSessions.set(player.id, {
                    kind: "guest",
                    playerId: result.data.playerId,
                });
                return;
            case "signed_in":
                preJoinSessions.set(player.id, {
                    kind: "signed-in",
                    account: result.data.account,
                    playerId: result.data.playerId,
                    canonicalName: result.data.canonicalName,
                });
                return { name: result.data.canonicalName };
            case "password_required":
                preJoinSessions.set(player.id, {
                    kind: "password-required",
                    account: result.data.account,
                    playerId: result.data.playerId,
                    identity: createPlayerIdentity(player),
                });
                return;
        }
    } catch (error) {
        console.error("Failed to resolve player session:", error);
        preJoinSessions.set(player.id, {
            kind: "guest",
            playerId: `unavailable:${player.id}`,
        });
        return;
    }
}

function acceptPreResolvedPlayer({
    room,
    playerId,
    session,
    downstreamModules,
}: {
    room: Room;
    playerId: number;
    session: PreJoinSession;
    downstreamModules: Module[];
}): void {
    switch (session.kind) {
        case "guest":
            acceptGuest({
                room,
                playerId,
                backendPlayerId: session.playerId,
                downstreamModules,
            });
            return;
        case "signed-in":
            acceptSignedIn({
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
                room,
                playerId,
                account: session.account,
                backendPlayerId: session.playerId,
                identity: session.identity,
            });
            return;
    }
}

function handlePasswordAttempt({
    room,
    player,
    roomId,
    password,
    downstreamModules,
}: {
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
        room,
        player,
        roomId,
        password: trimmedPassword,
        downstreamModules,
    }).catch((error) => {
        console.error("Failed to confirm player session:", error);

        if (sessions.get(player.id)?.kind !== "signing-in") {
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
    room,
    player,
    roomId,
    token,
    downstreamModules,
}: {
    room: Room;
    player: PlayerObject;
    roomId?: string | undefined;
    token: symbol;
    downstreamModules: Module[];
}): Promise<void> {
    if (!roomId) {
        acceptGuest({
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

    const currentSession = sessions.get(player.id);

    if (
        currentSession?.kind !== "resolving" ||
        currentSession.token !== token
    ) {
        return;
    }

    if (!result.ok) {
        console.error("Failed to resolve player session:", result.error);
        acceptGuest({
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
                room,
                playerId: player.id,
                backendPlayerId: result.data.playerId,
                downstreamModules,
            });
            return;
        case "signed_in":
            acceptSignedIn({
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
                room,
                playerId: player.id,
                account: result.data.account,
                backendPlayerId: result.data.playerId,
                identity: room.getPlayerIdentity(player.id) ?? undefined,
            });
            return;
    }
}

async function confirmPlayerPassword({
    room,
    player,
    roomId,
    password,
    downstreamModules,
}: {
    room: Room;
    player: PlayerObject;
    roomId?: string | undefined;
    password: string;
    downstreamModules: Module[];
}): Promise<void> {
    const session = sessions.get(player.id);

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

    const currentSession = sessions.get(player.id);

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
    acceptSignedIn({
        room,
        playerId: player.id,
        account: result.data.account,
        backendPlayerId: result.data.playerId,
        canonicalName: result.data.canonicalName,
        downstreamModules,
    });
}

function requirePassword({
    room,
    playerId,
    account,
    backendPlayerId,
    identity,
}: {
    room: Room;
    playerId: number;
    account: SessionAccount;
    backendPlayerId: string;
    identity?: PlayerIdentity | undefined;
}): void {
    if (!room.getPlayer(playerId)) {
        return;
    }

    const playerIdentity = identity ?? room.getPlayerIdentity(playerId);

    if (!playerIdentity) {
        return;
    }

    const timeout = setTimeout(() => {
        const session = sessions.get(playerId);

        if (session?.kind !== "signing-in") {
            return;
        }

        sessions.delete(playerId);

        room.kick(playerId, t`Sign-in timed out.`);
    }, SIGN_IN_TIMEOUT_MS);

    sessions.set(playerId, {
        kind: "signing-in",
        account,
        playerId: backendPlayerId,
        identity: playerIdentity,
        timeout,
    });

    hideSigningInPlayer(room, playerId);

    room.send({
        message: t`🔐 This name is registered. Type your password in chat to sign in.`,
        color: COLOR.SYSTEM,
        to: playerId,
        sound: "notification",
    });
}

function acceptGuest({
    room,
    playerId,
    backendPlayerId,
    downstreamModules,
}: {
    room: Room;
    playerId: number;
    backendPlayerId: string;
    downstreamModules: Module[];
}): void {
    if (!room.getPlayer(playerId)) {
        return;
    }

    sessions.set(playerId, { kind: "guest", playerId: backendPlayerId });

    reconcileAcceptedPlayerVisibility(room, playerId);
    releasePlayerJoin(room, playerId, downstreamModules);
}

function acceptSignedIn({
    room,
    playerId,
    account,
    backendPlayerId,
    canonicalName,
    downstreamModules,
}: {
    room: Room;
    playerId: number;
    account: SessionAccount;
    backendPlayerId: string;
    canonicalName: string;
    downstreamModules: Module[];
}): void {
    const player = room.getPlayer(playerId);
    const previousSession = sessions.get(playerId);

    if (!player) {
        return;
    }

    if (
        player.name !== canonicalName &&
        previousSession?.kind !== "signing-in"
    ) {
        renamingPlayerIds.add(playerId);
        room.renamePlayer(player, canonicalName);
    }

    sessions.set(playerId, {
        kind: "signed-in",
        account,
        playerId: backendPlayerId,
    });

    if (previousSession?.kind === "signing-in") {
        revealSigningInPlayer(room, {
            ...previousSession.identity,
            name: canonicalName,
        });
    } else {
        reconcileAcceptedPlayerVisibility(room, playerId);
    }

    room.send({
        message: t`✅ Signed in as ${account.name}.`,
        color: COLOR.SUCCESS,
        to: playerId,
        sound: "notification",
    });

    releasePlayerJoin(room, playerId, downstreamModules);
}

function hideSigningInPlayer(room: Room, playerId: number): void {
    for (const player of room.getPlayerList()) {
        if (player.id === playerId) {
            continue;
        }

        room.sendPlayerLeaveTo(playerId, player.id);
        room.sendPlayerLeaveTo(player.id, playerId);
    }
}

function reconcileAcceptedPlayerVisibility(room: Room, playerId: number): void {
    for (const player of room.getPlayerList()) {
        if (player.id === playerId || !isAuthenticationPending(player.id)) {
            continue;
        }

        room.sendPlayerLeaveTo(player.id, playerId);
        room.sendPlayerLeaveTo(playerId, player.id);
    }
}

function revealSigningInPlayer(room: Room, identity: PlayerIdentity): void {
    for (const player of room.getPlayerList()) {
        if (player.id === identity.id || isAuthenticationPending(player.id)) {
            continue;
        }

        const playerIdentity = room.getPlayerIdentity(player.id);

        if (playerIdentity) {
            room.sendPlayerJoinTo(playerIdentity, identity.id);
        }

        room.sendPlayerJoinTo(identity, player.id);
    }
}

function createPlayerIdentity(player: PlayerJoinData): PlayerIdentity {
    return {
        id: player.id,
        name: player.name,
        flag: player.flag,
        avatar: player.avatar,
        conn: player.conn ?? "",
        auth: player.auth ?? "",
    };
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
        module.call("onPlayerJoin", room, player);
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

function clearSessionTimeout(session: PlayerSession | undefined): void {
    if (session?.kind === "signing-in") {
        clearTimeout(session.timeout);
    }
}

function isAuthenticationPending(playerId: number): boolean {
    return isAuthenticationPendingSession(sessions.get(playerId));
}

function isAuthenticationPendingSession(
    session: PlayerSession | undefined,
): boolean {
    return session?.kind === "resolving" || session?.kind === "signing-in";
}
