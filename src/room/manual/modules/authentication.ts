import { api } from "@api/client";
import { createModule, Module } from "@core/module";
import { Room } from "@core/room";
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

type AuthenticationModuleOptions = {
    roomId?: string | undefined;
    downstreamModules: Module[];
};

const SIGN_IN_TIMEOUT_MS = 30_000;
const sessions = new Map<number, PlayerSession>();
const renamingPlayerIds = new Set<number>();

export function getPlayerSession(playerId: number): PlayerSession | null {
    return sessions.get(playerId) ?? null;
}

export function getPlayerBackendId(playerId: number): string | null {
    const session = sessions.get(playerId);
    return session && session.kind !== "resolving" ? session.playerId : null;
}

export function getPlayerDisplayName(player: PlayerObject): string {
    const session = sessions.get(player.id);

    if (session?.kind === "signed-in") {
        return `✅ ${player.name}`;
    }

    if (session?.kind === "guest") {
        return `✖️ ${player.name}`;
    }

    return player.name;
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
        .onRoomLink((room) => {
            installAnnouncementFilter(room);
        })
        .onPlayerJoin((room, player) => {
            if (renamingPlayerIds.has(player.id)) {
                renamingPlayerIds.delete(player.id);
                return false;
            }

            installAnnouncementFilter(room);

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

            if (
                actor &&
                isAuthenticationPending(actor.id) &&
                operation.kind !== "chat"
            ) {
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
}: {
    room: Room;
    playerId: number;
    account: SessionAccount;
    backendPlayerId: string;
}): void {
    if (!room.getPlayer(playerId)) {
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

    if (!player) {
        return;
    }

    if (player.name !== canonicalName) {
        renamingPlayerIds.add(playerId);
        room.renamePlayer(player, canonicalName);
    }

    sessions.set(playerId, {
        kind: "signed-in",
        account,
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
    return {
        roomId,
        roomPlayerId: player.id,
        name: player.name,
        auth: player.auth ?? null,
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
