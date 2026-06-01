export const FLAG_COMMAND = {
    DOWN: "down",
    LINE_OF_SCRIMMAGE: "los",
    UNDO: "undo",
    INFO: "info",
    REPOSITION: "reposition",
    SCORE: "score",
    FLAG: "flag",
    FLAGS: "flags",
} as const;

export const SHARED_COMMAND_NAMES = [
    FLAG_COMMAND.UNDO,
    FLAG_COMMAND.INFO,
    FLAG_COMMAND.SCORE,
] as const;

export type FlagCommandName = (typeof FLAG_COMMAND)[keyof typeof FLAG_COMMAND];

export type SharedCommandName = (typeof SHARED_COMMAND_NAMES)[number];
