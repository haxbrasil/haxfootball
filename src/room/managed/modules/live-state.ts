import WebSocket from "ws";
import { api } from "@api/client";
import { createModule, type Module } from "@core/module";
import type { Room } from "@core/room";
import { toApiTeam } from "@room/managed/domain/api-event-fields";
import {
    getPlayerPlayEligibility,
    type PlayerSessionReader,
} from "@room/shared/domain/player-sessions";
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
    allowGuestPlay: boolean;
    commId: string;
    commandHandlers?: Record<string, LiveStateCommandHandler> | undefined;
    documentProvider?: LiveStateDocumentProvider | undefined;
    getPlayerSession: PlayerSessionReader;
    liveStateContract?: LiveStateContract | null | undefined;
    roomId: string;
    roomName: string;
};

const SNAPSHOT_INTERVAL_MS = 5_000;
const RECONNECT_INITIAL_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

export function createManagedLiveStateModule({
    allowGuestPlay,
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
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let connecting = false;
    const desyncedPlayerIds = new Set<number>();

    const snapshotProvider = () => {
        if (!linkedRoom) return undefined;

        revision += 1;
        return buildManagedLiveStateSnapshot({
            allowGuestPlay,
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

    const clearSnapshotInterval = () => {
        if (!snapshotInterval) return;

        clearInterval(snapshotInterval);
        snapshotInterval = null;
    };

    const scheduleSnapshot = () => {
        setTimeout(sendSnapshot, 0);
    };

    const scheduleReconnect = () => {
        if (reconnectTimeout || !linkedRoom) return;

        const delay = Math.min(
            RECONNECT_INITIAL_DELAY_MS * 2 ** reconnectAttempt,
            RECONNECT_MAX_DELAY_MS,
        );
        reconnectAttempt += 1;

        reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            connect();
        }, delay);
    };

    const connect = (room?: Room) => {
        if (room) {
            linkedRoom = room;
        }

        if (!linkedRoom || connection || connecting) return;

        connecting = true;

        void api.rooms
            .attachLive({
                commId,
                onAccepted: () => {
                    reconnectAttempt = 0;
                    clearSnapshotInterval();
                    snapshotInterval = setInterval(
                        sendSnapshot,
                        SNAPSHOT_INTERVAL_MS,
                    );
                },
                onClose: () => {
                    clearSnapshotInterval();
                    connection = null;
                    connecting = false;
                    scheduleReconnect();
                },
                onCommand: handleCommand,
                onError: (error) => {
                    console.error("Live state socket error:", error);
                },
                onRejected: (error) => {
                    console.error("Live state connection rejected:", error);
                    const rejectedConnection = connection;
                    connection = null;
                    connecting = false;
                    rejectedConnection?.close();
                    scheduleReconnect();
                },
                roomId,
                snapshotProvider,
                snapshotRevision: revision || null,
                webSocket:
                    WebSocket as unknown as LiveRoomControlWebSocketConstructor,
            })
            .then((nextConnection) => {
                connection = nextConnection;
                connecting = false;
            })
            .catch((error) => {
                connecting = false;
                console.error("Failed to connect live state socket:", error);
                scheduleReconnect();
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

export function buildManagedLiveStateSnapshot({
    allowGuestPlay,
    documentProvider,
    desyncedPlayerIds,
    getPlayerSession,
    liveStateContract,
    room,
    roomName,
    revision,
}: {
    allowGuestPlay: boolean;
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
            const eligibility = getPlayerPlayEligibility({
                allowGuestPlay,
                managedRoom: true,
                session,
            });

            return {
                roomPlayerId: player.id,
                name: player.name,
                team: toApiTeam(player.team),
                admin: player.admin,
                avatar: null,
                desynced: desyncedPlayerIds.has(player.id),
                sessionKind: session?.kind ?? null,
                playable: eligibility.playable,
                playBlockedReason:
                    eligibility.playBlockedReason === "none"
                        ? null
                        : eligibility.playBlockedReason,
            };
        }),
        stateDocuments: liveStateContract ? (documentProvider?.() ?? []) : [],
    };
}
