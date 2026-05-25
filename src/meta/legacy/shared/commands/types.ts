import { CommandHandleResult, type CommandSpec } from "@core/commands";
import type { DownState } from "@meta/legacy/shared/down";
import type { FieldTeam } from "@runtime/models";
import {
    SHARED_COMMAND_NAMES,
    type SharedCommandName,
} from "@meta/legacy/shared/commands/names";

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

export type SharedCommandInvocation = {
    player: PlayerObject;
    spec: CommandSpec;
    options: SharedCommandOptions;
    statePart: string | DownState;
};

export type SharedCommandImplementation = (
    invocation: SharedCommandInvocation,
) => CommandHandleResult | void;

export { SHARED_COMMAND_NAMES };
export type { SharedCommandName };
