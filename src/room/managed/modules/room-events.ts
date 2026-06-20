import { api } from "@api/client";
import { createModule, type Module } from "@core/module";
import {
    type RoomPlayerEventHook,
    toPlayerRoomEvent,
} from "@room/managed/domain/room-player-events";
import type { RoomManagerEventSink } from "@room/shared/domain/room-manager";
import type { PlayerSessionStore } from "@room/shared/domain/player-sessions";

export function createManagedRoomEvents({
    roomId,
    sessionStore,
}: {
    roomId?: string | undefined;
    sessionStore: PlayerSessionStore;
}): Module {
    let queue = Promise.resolve();

    const enqueue = (task: () => Promise<void>): void => {
        queue = queue.then(task).catch((error) => {
            console.error("Failed to persist room event:", error);
        });
    };

    const appendPlayerEvent = (
        hook: RoomPlayerEventHook,
        player: PlayerObject,
    ): void => {
        if (!roomId) return;

        const event = toPlayerRoomEvent({
            hook,
            player,
            getPlayerSession: sessionStore.get,
        });
        const currentRoomId = roomId;

        enqueue(async () => {
            const result = await api.rooms.addEvent(currentRoomId, event);

            if (!result.ok) {
                throw result.error;
            }
        });
    };

    return createModule()
        .onPlayerJoin((_room, player) => {
            appendPlayerEvent("onPlayerJoin", player);
        })
        .onPlayerLeave((_room, player) => {
            appendPlayerEvent("onPlayerLeave", player);
        })
        .onPlayerTeamChange((_room, player) => {
            appendPlayerEvent("onPlayerTeamChange", player);
        });
}

export function createManagedRoomManagerEventSink({
    roomId,
}: {
    roomId?: string | undefined;
}): RoomManagerEventSink {
    let queue = Promise.resolve();

    const enqueue = (task: () => Promise<void>): void => {
        queue = queue.then(task).catch((error) => {
            console.error("Failed to persist room manager event:", error);
        });
    };

    return (event) => {
        if (!roomId) return;

        const currentRoomId = roomId;

        enqueue(async () => {
            const result = await api.rooms.addEvent(currentRoomId, {
                domain: "system",
                type: event.type,
                scope: "match",
                value: event.payload,
            });

            if (!result.ok) {
                throw result.error;
            }
        });
    };
}
