import { api } from "@api/client";
import { createModule, type Module } from "@core/module";
import type {
    IncidentKind,
    IncidentPayload,
    IncidentRecorder,
} from "@room/shared/domain/incidents";

type RoomIncidentReporterOptions = {
    commId?: string | undefined;
    recorder: IncidentRecorder;
    roomId?: string | undefined;
};

const DESYNC_INCIDENT_GROUP_DELAY_MS = 500;

export type RoomIncidentReporter = {
    captureAndUpload(
        kind: IncidentKind,
        context?: Parameters<IncidentRecorder["captureIncident"]>[1],
    ): void;
    flushCrash(
        kind: Exclude<IncidentKind, "desync">,
        reason: string,
    ): Promise<void>;
};

export function createRoomIncidentReporter({
    commId,
    recorder,
    roomId,
}: RoomIncidentReporterOptions): RoomIncidentReporter {
    let queue = Promise.resolve();

    const upload = async (payload: IncidentPayload): Promise<void> => {
        if (!roomId || !commId) {
            return;
        }

        const result = await api.rooms.addIncident(roomId, {
            ...payload,
            commId,
        });

        if (!result.ok) {
            throw result.error;
        }

        console.error("Room incident uploaded:", result.data.url);
    };

    const enqueue = (payload: IncidentPayload): void => {
        queue = queue
            .then(() => upload(payload))
            .catch((error) => {
                console.error("Failed to upload room incident:", error);
            });
    };

    return {
        captureAndUpload(kind, context = {}) {
            enqueue(recorder.captureIncident(kind, context));
        },
        async flushCrash(kind, reason) {
            await upload(
                recorder.captureIncident(kind, {
                    reason,
                }),
            );
        },
    };
}

export function createManagedIncidentModule({
    reporter,
}: {
    reporter: RoomIncidentReporter;
}): Module {
    const desyncedPlayers = new Set<number>();
    const pendingDesyncPlayers = new Map<number, PlayerObject>();
    const pendingDesyncIncident: {
        timer: ReturnType<typeof setTimeout> | null;
    } = {
        timer: null,
    };

    function flushPendingDesyncIncident(): void {
        if (pendingDesyncIncident.timer) {
            clearTimeout(pendingDesyncIncident.timer);
            pendingDesyncIncident.timer = null;
        }

        const players = Array.from(pendingDesyncPlayers.values()).map(
            (player) => ({
                id: player.id,
                name: player.name,
            }),
        );

        pendingDesyncPlayers.clear();

        if (players.length === 0) {
            return;
        }

        if (players.length === 1) {
            for (const player of players) {
                reporter.captureAndUpload("desync", {
                    playerId: player.id,
                    players,
                    reason: `${player.name} reported desync`,
                });
            }
            return;
        }

        reporter.captureAndUpload("desync", {
            players,
            reason: `${players.length} players reported desync together`,
        });
    }

    function scheduleDesyncIncident(player: PlayerObject): void {
        pendingDesyncPlayers.set(player.id, player);

        if (pendingDesyncIncident.timer) {
            return;
        }

        pendingDesyncIncident.timer = setTimeout(
            flushPendingDesyncIncident,
            DESYNC_INCIDENT_GROUP_DELAY_MS,
        );
    }

    return createModule()
        .onPlayerLeave((_room, player) => {
            desyncedPlayers.delete(player.id);
        })
        .onGameStop(() => {
            flushPendingDesyncIncident();
            desyncedPlayers.clear();
        })
        .onPlayerSyncChange((_room, player, desynced) => {
            if (!desynced) {
                desyncedPlayers.delete(player.id);
                return;
            }

            if (desyncedPlayers.has(player.id)) {
                return;
            }

            desyncedPlayers.add(player.id);
            scheduleDesyncIncident(player);
        });
}
