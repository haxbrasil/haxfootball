import { createModule, type Module } from "@core/module";
import { getGameModeDefinition } from "@modes/registry";
import {
    DEFAULT_GAME_MODE,
    type GameModeStore,
} from "@room/shared/domain/game-mode";
import { applyGameModeRoomSettings } from "@room/shared/domain/game-mode-room-settings";

export function createManagedLifecycleModule({
    gameModeStore,
}: {
    gameModeStore: GameModeStore;
}): Module {
    return createModule().onPlayerLeave((room) => {
        if (room.getPlayerList().length > 0) return;

        if (room.getScores()) {
            room.stopGame();
        }

        gameModeStore.set(DEFAULT_GAME_MODE);
        applyGameModeRoomSettings(
            room,
            getGameModeDefinition(DEFAULT_GAME_MODE),
        );
    });
}
