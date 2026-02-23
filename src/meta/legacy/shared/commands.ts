import { CommandHandleResult, type CommandSpec } from "@core/commands";
import type { DownState } from "@meta/legacy/shared/down";
import { $checkpoints, $effect, $restore } from "@runtime/runtime";
import { $global } from "@meta/legacy/hooks/global";
import { cn } from "@meta/legacy/shared/message";
import { t } from "@lingui/core/macro";

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

const LEGACY_COMMAND_NAMES = ["undo", "info", "score"] as const;

export type SharedCommandName = (typeof LEGACY_COMMAND_NAMES)[number];

type SharedCommandInvocation = {
    player: PlayerObject;
    spec: CommandSpec;
};

type SharedCommandImplementation = (
    player: PlayerObject,
    command: CommandSpec,
) => CommandHandleResult | void;

type SharedCommandHandlers = Partial<
    Record<SharedCommandName, SharedCommandImplementation>
>;

const isLegacyCommandName = (
    commandName: string,
): commandName is SharedCommandName =>
    (LEGACY_COMMAND_NAMES as readonly string[]).includes(commandName);

const isLegacyCommandEnabled = (
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
        default:
            return false;
    }
};

const createLegacyCommandDispatcher = ({
    options,
    handlers,
}: {
    options: SharedCommandOptions;
    handlers: SharedCommandHandlers;
}): ((invocation: SharedCommandInvocation) => CommandHandleResult) => {
    return ({ player, spec }) => {
        if (!isLegacyCommandName(spec.name)) {
            return { handled: false };
        }

        if (!isLegacyCommandEnabled(options, spec.name)) {
            return { handled: false };
        }

        const handler = handlers[spec.name];
        if (!handler) {
            return { handled: false };
        }

        return handler(player, spec) ?? { handled: true };
    };
};

const getInfoStatePart = (
    options: SharedCommandOptions,
): string | DownState => {
    if (!options.info || options.info === true) {
        return "";
    }

    return options.info.stateMessage ?? options.info.downState ?? "";
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
    const statePart = getInfoStatePart(options);

    const dispatch = createLegacyCommandDispatcher({
        options,
        handlers: {
            undo: (player: PlayerObject) => {
                if (!player.admin) {
                    $effect(($) => {
                        $.send(
                            t`⚠️ Only admins can call for an undo.`,
                            player.id,
                        );
                    });

                    return { handled: true };
                }

                const checkpoints = $checkpoints();

                if (checkpoints.length === 0) {
                    $effect(($) => {
                        $.send(
                            t`⚠️ No checkpoints available to undo.`,
                            player.id,
                        );
                    });

                    return { handled: true };
                }

                $effect(($) => {
                    $.send(
                        t`⏪ ${player.name} calls for an undo! Rewinding to the last checkpoint...`,
                    );
                });

                $restore();
            },
            info: (player: PlayerObject) => {
                const { scores } = $global();

                $effect(($) => {
                    $.send(cn("📋", statePart, scores), player.id);
                });

                return { handled: true };
            },
            score: (player: PlayerObject) => {
                const { scores } = $global();

                $effect(($) => {
                    $.send(cn("🏈", scores), player.id);
                });

                return { handled: true };
            },
        },
    });

    return dispatch({ player, spec });
}
