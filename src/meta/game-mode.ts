export const GAME_MODE = {
    LEGACY: "legacy",
    TRAINING: "training",
} as const;

export type GameModeName = (typeof GAME_MODE)[keyof typeof GAME_MODE];

export const GAME_MODE_NAMES = Object.values(GAME_MODE);

export const DEFAULT_GAME_MODE = GAME_MODE.LEGACY;

export function parseGameModeName(
    value: string | undefined,
): GameModeName | null {
    if (!value) return null;

    const normalized = value.trim().toLowerCase();

    return GAME_MODE_NAMES.find((modeName) => modeName === normalized) ?? null;
}
