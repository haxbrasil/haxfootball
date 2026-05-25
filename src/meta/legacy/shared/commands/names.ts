export const LEGACY_COMMAND = {
    PUNT: "punt",
    FIELD_GOAL: "fg",
    DISTANCE: "distance",
    DOWN: "down",
    LINE_OF_SCRIMMAGE: "los",
    UNDO: "undo",
    INFO: "info",
    REPOSITION: "reposition",
    SCORE: "score",
    QUARTERBACK: "qb",
    FLAG: "flag",
    FLAGS: "flags",
} as const;

export const SHARED_COMMAND_NAMES = [
    LEGACY_COMMAND.UNDO,
    LEGACY_COMMAND.INFO,
    LEGACY_COMMAND.SCORE,
    LEGACY_COMMAND.QUARTERBACK,
] as const;

export type LegacyCommandName =
    (typeof LEGACY_COMMAND)[keyof typeof LEGACY_COMMAND];

export type SharedCommandName = (typeof SHARED_COMMAND_NAMES)[number];
