import {
    DEFAULT_GAME_MODE,
    GAME_MODE_NAMES,
    parseGameModeName,
    type GameModeName,
} from "@modes/game-mode";

export type GameModeReader = () => GameModeName;

export type GameModeStore = {
    get: GameModeReader;
    set(mode: GameModeName): void;
};

export function createGameModeStore(
    initialMode: GameModeName = DEFAULT_GAME_MODE,
): GameModeStore {
    let currentMode = initialMode;

    return {
        get: () => currentMode,
        set: (mode) => {
            currentMode = mode;
        },
    };
}

export { DEFAULT_GAME_MODE, GAME_MODE_NAMES, parseGameModeName };
export type { GameModeName };
