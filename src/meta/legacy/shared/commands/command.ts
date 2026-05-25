import { CommandHandleResult, type CommandSpec } from "@core/commands";
import type { DownState } from "@meta/legacy/shared/down";
import { infoCommandHandler } from "@meta/legacy/shared/commands/handlers/info";
import { qbCommandHandler } from "@meta/legacy/shared/commands/handlers/qb";
import { scoreCommandHandler } from "@meta/legacy/shared/commands/handlers/score";
import { undoCommandHandler } from "@meta/legacy/shared/commands/handlers/undo";
import { LEGACY_COMMAND } from "@meta/legacy/shared/commands/names";
import {
    SHARED_COMMAND_NAMES,
    type SharedCommandImplementation,
    type SharedCommandInvocation,
    type SharedCommandName,
    type SharedCommandOptions,
} from "@meta/legacy/shared/commands/types";

type SharedCommandHandlers = Partial<
    Record<SharedCommandName, SharedCommandImplementation>
>;

const sharedCommandHandlers: SharedCommandHandlers = {
    [LEGACY_COMMAND.UNDO]: undoCommandHandler,
    [LEGACY_COMMAND.INFO]: infoCommandHandler,
    [LEGACY_COMMAND.SCORE]: scoreCommandHandler,
    [LEGACY_COMMAND.QUARTERBACK]: qbCommandHandler,
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
        case LEGACY_COMMAND.UNDO:
            return options.undo === true;
        case LEGACY_COMMAND.INFO:
            return options.info !== false && options.info !== undefined;
        case LEGACY_COMMAND.SCORE:
            return options.score !== false;
        case LEGACY_COMMAND.QUARTERBACK:
            return options.qb !== undefined;
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
    SharedQuarterbackCommandOptions,
} from "@meta/legacy/shared/commands/types";
