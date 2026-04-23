import { CommandHandleResult, type CommandSpec } from "@core/commands";
import type { DownState } from "@meta/legacy/shared/down";
import { infoCommandHandler } from "@meta/legacy/shared/commands/handlers/info";
import { qbCommandHandler } from "@meta/legacy/shared/commands/handlers/qb";
import { scoreCommandHandler } from "@meta/legacy/shared/commands/handlers/score";
import { undoCommandHandler } from "@meta/legacy/shared/commands/handlers/undo";
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
    undo: undoCommandHandler,
    info: infoCommandHandler,
    score: scoreCommandHandler,
    qb: qbCommandHandler,
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
        case "undo":
            return options.undo === true;
        case "info":
            return options.info !== false && options.info !== undefined;
        case "score":
            return options.score !== false;
        case "qb":
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
