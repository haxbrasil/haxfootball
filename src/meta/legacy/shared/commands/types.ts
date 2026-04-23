import { CommandHandleResult, type CommandSpec } from "@core/commands";
import type { DownState } from "@meta/legacy/shared/down";
import type { FieldTeam } from "@runtime/models";

export type SharedInfoCommandOptions =
    | true
    | {
          downState?: DownState;
          stateMessage?: string;
      };

export type SharedQuarterbackCommandOptions = {
    eligibleTeam: FieldTeam;
};

export type SharedCommandOptions = {
    undo?: boolean;
    info?: false | SharedInfoCommandOptions;
    score?: boolean;
    qb?: SharedQuarterbackCommandOptions;
};

export const SHARED_COMMAND_NAMES = ["undo", "info", "score", "qb"] as const;

export type SharedCommandName = (typeof SHARED_COMMAND_NAMES)[number];

export type SharedCommandInvocation = {
    player: PlayerObject;
    spec: CommandSpec;
    options: SharedCommandOptions;
    statePart: string | DownState;
};

export type SharedCommandImplementation = (
    invocation: SharedCommandInvocation,
) => CommandHandleResult | void;
