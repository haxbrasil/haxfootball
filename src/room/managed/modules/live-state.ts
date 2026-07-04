import WebSocket from "ws";
import { api } from "@api/client";
import { createModule, type Module } from "@core/module";
import type { Room } from "@core/room";
import { toApiTeam } from "@room/managed/domain/api-event-fields";
import type { PlayerSessionReader } from "@room/shared/domain/player-sessions";
import type {
    LiveRoomAttachment,
    LiveRoomControlCommand,
    LiveRoomControlWebSocketConstructor,
} from "@haxbrasil/haxfootball-api-sdk";

export type LiveStateContract = {
    namespace: string;
    documents: Array<{ name: string; version: number; schema: unknown }>;
    facts: Array<{
        key: string;
        type: "string" | "number" | "boolean";
        document: string;
        pointer: string;
    }>;
};

type LiveStateDocumentSnapshot = {
    name: string;
    version: number;
    payload: unknown;
};

type LiveStateDocumentProvider = () => LiveStateDocumentSnapshot[];

export type LiveStateCommandHandler = (input: {
    command: LiveRoomControlCommand;
    room: Room;
}) => unknown | Promise<unknown>;

type ManagedLiveStateModuleOptions = {
    commId: string;
    commandHandlers?: Record<string, LiveStateCommandHandler> | undefined;
    documentProvider?: LiveStateDocumentProvider | undefined;
    getPlayerSession: PlayerSessionReader;
    liveStateContract?: LiveStateContract | null | undefined;
    roomId: string;
    roomName: string;
};

const SNAPSHOT_INTERVAL_MS = 5_000;

export function createManagedLiveStateModule({
    commId,
    commandHandlers,
    documentProvider,
    getPlayerSession,
    liveStateContract,
    roomId,
    roomName,
}: ManagedLiveStateModuleOptions): Module {
    let connection: LiveRoomAttachment | null = null;
    let linkedRoom: Room | null = null;
    let revision = 0;
    let snapshotInterval: ReturnType<typeof setInterval> | null = null;
    const desyncedPlayerIds = new Set<number>();

    const snapshotProvider = () => {
        if (!linkedRoom) return undefined;

        revision += 1;
        return buildSnapshot({
            documentProvider,
            desyncedPlayerIds,
            getPlayerSession,
            liveStateContract,
            room: linkedRoom,
            roomName,
            revision,
        });
    };

    const sendSnapshot = () => {
        connection?.sendSnapshot();
    };

    const scheduleSnapshot = () => {
        setTimeout(sendSnapshot, 0);
    };

    const connect = (room: Room) => {
        linkedRoom = room;

        if (connection) {
            return;
        }

        void api.rooms
            .attachLive({
                commId,
                onClose: () => {
                    if (snapshotInterval) {
                        clearInterval(snapshotInterval);
                        snapshotInterval = null;
                    }
                    connection = null;
                },
                onCommand: handleCommand,
                onError: (error) => {
                    console.error("Live state socket error:", error);
                },
                onRejected: (error) => {
                    console.error("Live state connection rejected:", error);
                },
                roomId,
                snapshotProvider,
                snapshotRevision: revision || null,
                webSocket:
                    WebSocket as unknown as LiveRoomControlWebSocketConstructor,
            })
            .then((nextConnection) => {
                connection = nextConnection;
                snapshotInterval = setInterval(
                    sendSnapshot,
                    SNAPSHOT_INTERVAL_MS,
                );
            })
            .catch((error) => {
                console.error("Failed to connect live state socket:", error);
            });
    };

    const handleCommand = async (command: LiveRoomControlCommand) => {
        if (!linkedRoom) {
            throw new Error("Live room is not linked");
        }

        const handlers: Record<string, LiveStateCommandHandler> = {
            ping: () => ({ pong: true }),
            ...commandHandlers,
        };
        const handler = handlers[command.name];

        if (!handler) {
            throw new Error(`Unsupported live room command '${command.name}'`);
        }

        const result = await handler({ command, room: linkedRoom });

        scheduleSnapshot();

        return result;
    };

    return createModule()
        .onRoomLink((room) => connect(room))
        .onPlayerJoin(() => scheduleSnapshot())
        .onPlayerLeave((_room, player) => {
            desyncedPlayerIds.delete(player.id);
            scheduleSnapshot();
        })
        .onPlayerTeamChange(() => scheduleSnapshot())
        .onPlayerAdminChange(() => scheduleSnapshot())
        .onPlayerSyncChange((_room, player, desynced) => {
            if (desynced) {
                desyncedPlayerIds.add(player.id);
            } else {
                desyncedPlayerIds.delete(player.id);
            }
            scheduleSnapshot();
        })
        .onGameStart(() => scheduleSnapshot())
        .onGameStop(() => scheduleSnapshot())
        .onGamePause(() => scheduleSnapshot())
        .onGameUnpause(() => scheduleSnapshot())
        .onTeamGoal(() => scheduleSnapshot());
}

function buildSnapshot({
    documentProvider,
    desyncedPlayerIds,
    getPlayerSession,
    liveStateContract,
    room,
    roomName,
    revision,
}: {
    documentProvider: LiveStateDocumentProvider | undefined;
    desyncedPlayerIds: Set<number>;
    getPlayerSession: PlayerSessionReader;
    liveStateContract: LiveStateContract | null | undefined;
    room: Room;
    roomName: string;
    revision: number;
}) {
    const scores = room.getScores();

    return {
        revision,
        room: {
            name: roomName,
            teamsLocked: null,
            gameStatus: room.getGameStatus(),
            scores: scores ? { red: scores.red, blue: scores.blue } : null,
        },
        players: room.getPlayerList().map((player) => {
            const session = getPlayerSession(player.id);

            return {
                roomPlayerId: player.id,
                name: player.name,
                team: toApiTeam(player.team),
                admin: player.admin,
                avatar: null,
                desynced: desyncedPlayerIds.has(player.id),
                sessionKind: session?.kind ?? null,
                playable: session
                    ? session.kind === "guest" || session.kind === "signed-in"
                    : null,
                playBlockedReason: playBlockedReason(session?.kind ?? null),
            };
        }),
        stateDocuments: liveStateContract ? (documentProvider?.() ?? []) : [],
    };
}

function playBlockedReason(kind: string | null): string | null {
    switch (kind) {
        case "resolving":
        case "signing-in":
            return kind;
        default:
            return null;
    }
}
