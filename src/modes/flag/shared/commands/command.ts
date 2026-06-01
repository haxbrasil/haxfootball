import { CommandHandleResult, type CommandSpec } from "@core/commands";
import type { DownState } from "@modes/flag/shared/rules/down";
import { infoCommandHandler } from "@modes/flag/shared/commands/handlers/info";
import { scoreCommandHandler } from "@modes/flag/shared/commands/handlers/score";
import { undoCommandHandler } from "@modes/flag/shared/commands/handlers/undo";
import { FLAG_COMMAND } from "@modes/flag/shared/commands/names";
import {
    SHARED_COMMAND_NAMES,
    type SharedCommandImplementation,
    type SharedCommandInvocation,
    type SharedCommandName,
    type SharedCommandOptions,
} from "@modes/flag/shared/commands/types";

type SharedCommandHandlers = Partial<
    Record<SharedCommandName, SharedCommandImplementation>
>;

const sharedCommandHandlers: SharedCommandHandlers = {
    [FLAG_COMMAND.UNDO]: undoCommandHandler,
    [FLAG_COMMAND.INFO]: infoCommandHandler,
    [FLAG_COMMAND.SCORE]: scoreCommandHandler,
};

const isSharedCommandName = (
    commandName: string,
): commandName is SharedCommandName =>
    (SHARED_COMMAND_NAMES as readonly string[]).includes(commandName);

const isSharedCommandEnabled = (
    options: SharedCommandOptions,
    commandName: SharedCommandName,
): boolean => {
    switch (commandName) {
        case FLAG_COMMAND.UNDO:
            return options.undo === true;
        case FLAG_COMMAND.INFO:
            return options.info !== false && options.info !== undefined;
        case FLAG_COMMAND.SCORE:
            return options.score !== false;
        default:
            return false;
    }
};

const getInfoStatePart = (
    options: SharedCommandOptions,
): string | DownState => {
    if (!options.info || options.info === true) {
        return "";
    }

    return options.info.stateMessage ?? options.info.downState ?? "";
};

const dispatchSharedCommand = ({
    player,
    spec,
    options,
    statePart,
}: SharedCommandInvocation): CommandHandleResult => {
    if (!isSharedCommandName(spec.name)) {
        return { handled: false };
    }

    if (!isSharedCommandEnabled(options, spec.name)) {
        return { handled: false };
    }

    const handler = sharedCommandHandlers[spec.name];

    if (!handler) {
        return { handled: false };
    }

    return handler({ player, spec, options, statePart }) ?? { handled: true };
};

export function $createSharedCommandHandler({
    options,
    player,
    spec,
}: {
    options: SharedCommandOptions;
    player: PlayerObject;
    spec: CommandSpec;
}): CommandHandleResult {
    return dispatchSharedCommand({
        options,
        player,
        spec,
        statePart: getInfoStatePart(options),
    });
}

export type {
    SharedCommandImplementation,
    SharedCommandInvocation,
    SharedCommandName,
    SharedCommandOptions,
    SharedInfoCommandOptions,
} from "@modes/flag/shared/commands/types";
