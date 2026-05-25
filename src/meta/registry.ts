import { legacyMetaDefinition } from "@meta/legacy/definition";
import { trainingMetaDefinition } from "@meta/training/definition";
import {
    DEFAULT_GAME_MODE,
    GAME_MODE,
    GAME_MODE_NAMES,
    parseGameModeName,
    type GameModeName,
} from "./game-mode";
import type { GameMetaDefinition } from "./types";

export { DEFAULT_GAME_MODE, GAME_MODE, GAME_MODE_NAMES, parseGameModeName };
export type {
    GameMetaDefinition,
    GameMetaRuntime,
    GameModeName,
} from "./types";

export const GAME_META_DEFINITIONS = {
    [GAME_MODE.LEGACY]: legacyMetaDefinition,
    [GAME_MODE.TRAINING]: trainingMetaDefinition,
} satisfies Record<GameModeName, GameMetaDefinition>;

export const GAME_META_LIST = Object.values(GAME_META_DEFINITIONS);

export function getGameMeta(mode: GameModeName): GameMetaDefinition {
    return GAME_META_DEFINITIONS[mode];
}

export function shouldPersistGameMode(mode: GameModeName): boolean {
    return getGameMeta(mode).persistsMatches;
}
