export const CLASSIC_COMMAND = {
    PUNT: "punt",
    FIELD_GOAL: "fg",
    DISTANCE: "distance",
    DOWN: "down",
    LINE_OF_SCRIMMAGE: "los",
    UNDO: "undo",
    INFO: "info",
    REPOSITION: "reposition",
    SCORE: "score",
    SET_SCORE: "setscore",
    QUARTERBACK: "qb",
    FLAG: "flag",
    FLAGS: "flags",
} as const;

export const SHARED_COMMAND_NAMES = [
    CLASSIC_COMMAND.UNDO,
    CLASSIC_COMMAND.INFO,
    CLASSIC_COMMAND.SCORE,
    CLASSIC_COMMAND.SET_SCORE,
    CLASSIC_COMMAND.QUARTERBACK,
] as const;

export type ClassicCommandName =
    (typeof CLASSIC_COMMAND)[keyof typeof CLASSIC_COMMAND];

export type SharedCommandName = (typeof SHARED_COMMAND_NAMES)[number];
