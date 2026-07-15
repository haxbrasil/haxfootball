import type { CommandDefinition } from "@core/commands";
import { t } from "@lingui/core/macro";
import { CLASSIC_COMMAND } from "@modes/classic/shared/commands/names";
import { CommandCategory } from "@room/shared/domain/command-categories";

export const CLASSIC_COMMAND_DEFINITIONS: CommandDefinition[] = [
    {
        name: CLASSIC_COMMAND.PUNT,
        category: CommandCategory.Game,
        description: t`Punt the ball`,
    },
    {
        name: CLASSIC_COMMAND.FIELD_GOAL,
        category: CommandCategory.Game,
        description: t`Attempt a field goal`,
    },
    {
        name: CLASSIC_COMMAND.DISTANCE,
        category: CommandCategory.Game,
        description: t`Set the distance to first down`,
    },
    {
        name: CLASSIC_COMMAND.DOWN,
        category: CommandCategory.Game,
        description: t`Set the current down`,
    },
    {
        name: CLASSIC_COMMAND.LINE_OF_SCRIMMAGE,
        category: CommandCategory.Game,
        description: t`Set the line of scrimmage`,
    },
    {
        name: CLASSIC_COMMAND.UNDO,
        category: CommandCategory.Game,
        description: t`Undo the last play`,
    },
    {
        name: CLASSIC_COMMAND.INFO,
        category: CommandCategory.Game,
        description: t`Show game info`,
    },
    {
        name: CLASSIC_COMMAND.REPOSITION,
        category: CommandCategory.Game,
        description: t`Reposition players`,
    },
    {
        name: CLASSIC_COMMAND.SCORE,
        category: CommandCategory.Game,
        description: t`Show the score`,
    },
    {
        name: CLASSIC_COMMAND.SET_SCORE,
        category: CommandCategory.Game,
        description: t`Set the game score`,
    },
    {
        name: CLASSIC_COMMAND.QUARTERBACK,
        category: CommandCategory.Game,
        description: t`Set or clear the current quarterback`,
    },
    {
        name: CLASSIC_COMMAND.FLAG,
        category: CommandCategory.Game,
        description: t`View or set a config flag`,
    },
    {
        name: CLASSIC_COMMAND.FLAGS,
        category: CommandCategory.Game,
        description: t`List all config flags`,
    },
];
