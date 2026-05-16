import { createModule, type Module } from "@core/module";
import type { PlayerSessionStore } from "../domain/player-sessions";

export function createLocalPlayerSessionsModule({
    sessionStore,
}: {
    sessionStore: PlayerSessionStore;
}): Module {
    return createModule()
        .onPlayerJoin((_room, player) => {
            sessionStore.set(player.id, {
                kind: "guest",
                playerId: `local:${player.id}`,
            });
        })
        .onPlayerLeave((_room, player) => {
            sessionStore.delete(player.id);
        });
}
