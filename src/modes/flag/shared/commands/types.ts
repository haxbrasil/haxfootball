import { CommandHandleResult, type CommandSpec } from "@core/commands";
import type { DownState } from "@modes/flag/shared/rules/down";
import {
    SHARED_COMMAND_NAMES,
    type SharedCommandName,
} from "@modes/flag/shared/commands/names";

export type SharedInfoCommandOptions =
    | true
    | {
          downState?: DownState;
          stateMessage?: string;
      };

export type SharedCommandOptions = {
    undo?: boolean;
    info?: false | SharedInfoCommandOptions;
    score?: boolean;
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
