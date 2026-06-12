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

    return createModule()
        .onPlayerLeave((_room, player) => {
            desyncedPlayers.delete(player.id);
        })
        .onGameStop(() => {
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
            reporter.captureAndUpload("desync", {
                playerId: player.id,
                reason: `${player.name} reported desync`,
            });
        });
}
