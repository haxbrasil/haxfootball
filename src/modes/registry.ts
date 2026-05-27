import { classicModeDefinition } from "@modes/classic/definition";
import { trainingModeDefinition } from "@modes/training/definition";
import {
    DEFAULT_GAME_MODE,
    GAME_MODE,
    GAME_MODE_NAMES,
    parseGameModeName,
    type GameModeName,
} from "./game-mode";
import type { GameModeDefinition } from "./types";

export { DEFAULT_GAME_MODE, GAME_MODE, GAME_MODE_NAMES, parseGameModeName };
export type {
    GameModeDefinition,
    GameModeRuntime,
    GameModeName,
} from "./types";

export const GAME_MODE_DEFINITIONS = {
    [GAME_MODE.CLASSIC]: classicModeDefinition,
    [GAME_MODE.TRAINING]: trainingModeDefinition,
} satisfies Record<GameModeName, GameModeDefinition>;

export const GAME_MODE_LIST = Object.values(GAME_MODE_DEFINITIONS);

export function getGameModeDefinition(mode: GameModeName): GameModeDefinition {
    return GAME_MODE_DEFINITIONS[mode];
}

export function shouldPersistGameMode(mode: GameModeName): boolean {
    return getGameModeDefinition(mode).persistsMatches;
}
