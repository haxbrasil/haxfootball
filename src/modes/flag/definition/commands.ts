import type { CommandDefinition } from "@core/commands";
import { t } from "@lingui/core/macro";
import { FLAG_COMMAND } from "@modes/flag/shared/commands/names";
import { CommandCategory } from "@room/shared/domain/command-categories";

export const FLAG_COMMAND_DEFINITIONS: CommandDefinition[] = [
    {
        name: FLAG_COMMAND.DOWN,
        category: CommandCategory.Game,
        description: t`Set the current down`,
    },
    {
        name: FLAG_COMMAND.LINE_OF_SCRIMMAGE,
        category: CommandCategory.Game,
        description: t`Set the line of scrimmage`,
    },
    {
        name: FLAG_COMMAND.UNDO,
        category: CommandCategory.Game,
        description: t`Undo the last play`,
    },
    {
        name: FLAG_COMMAND.INFO,
        category: CommandCategory.Game,
        description: t`Show game info`,
    },
    {
        name: FLAG_COMMAND.REPOSITION,
        category: CommandCategory.Game,
        description: t`Reposition players`,
    },
    {
        name: FLAG_COMMAND.SCORE,
        category: CommandCategory.Game,
        description: t`Show the score`,
    },
    {
        name: FLAG_COMMAND.FLAG,
        category: CommandCategory.Game,
        description: t`View or set a config flag`,
    },
    {
        name: FLAG_COMMAND.FLAGS,
        category: CommandCategory.Game,
        description: t`List all config flags`,
    },
];
