import { COLOR } from "@common/general/color";
import { type ScoreState } from "@common/game/game";
import type { CommandDefinition } from "@core/commands";
import { t } from "@lingui/core/macro";
import { legacyGlobalSchema } from "@meta/legacy/global";
import { registry, stadium } from "@meta/legacy/meta";
import { cn, formatTeamName } from "@meta/legacy/shared/message";
import { LEGACY_COMMAND } from "@meta/legacy/shared/commands/names";
import type { GameMetaDefinition } from "@meta/types";
import { GAME_MODE } from "@meta/types";
import { Team } from "@runtime/models";
import type { GlobalSchemaState } from "@runtime/global";
import { CommandCategory } from "@room/shared/domain/command-categories";
import {
    createConfig,
    defaultConfig,
    getConfigFlagDescription,
    getConfigFlagNames,
    getConfigFlagValue,
    hasConfigFlag,
    setConfigFlagValue,
    type ConfigFlagName,
} from "./config";

type LegacyGlobalSnapshot = GlobalSchemaState<typeof legacyGlobalSchema>;

export const LEGACY_STATE = {
    KICKOFF: "KICKOFF",
} as const;

const TRUE_FLAG_VALUES = new Set([
    "1",
    "true",
    "on",
    "yes",
    "enabled",
    "enable",
]);
const FALSE_FLAG_VALUES = new Set([
    "0",
    "false",
    "off",
    "no",
    "disabled",
    "disable",
]);

const LEGACY_COMMAND_DEFINITIONS: CommandDefinition[] = [
    {
        name: LEGACY_COMMAND.PUNT,
        category: CommandCategory.Game,
        description: t`Punt the ball`,
    },
    {
        name: LEGACY_COMMAND.FIELD_GOAL,
        category: CommandCategory.Game,
        description: t`Attempt a field goal`,
    },
    {
        name: LEGACY_COMMAND.DISTANCE,
        category: CommandCategory.Game,
        description: t`Set the distance to first down`,
    },
    {
        name: LEGACY_COMMAND.DOWN,
        category: CommandCategory.Game,
        description: t`Set the current down`,
    },
    {
        name: LEGACY_COMMAND.LINE_OF_SCRIMMAGE,
        category: CommandCategory.Game,
        description: t`Set the line of scrimmage`,
    },
    {
        name: LEGACY_COMMAND.UNDO,
        category: CommandCategory.Game,
        description: t`Undo the last play`,
    },
    {
        name: LEGACY_COMMAND.INFO,
        category: CommandCategory.Game,
        description: t`Show game info`,
    },
    {
        name: LEGACY_COMMAND.REPOSITION,
        category: CommandCategory.Game,
        description: t`Reposition players`,
    },
    {
        name: LEGACY_COMMAND.SCORE,
        category: CommandCategory.Game,
        description: t`Show the score`,
    },
    {
        name: LEGACY_COMMAND.QUARTERBACK,
        category: CommandCategory.Game,
        description: t`Set or clear the current quarterback`,
    },
    {
        name: LEGACY_COMMAND.FLAG,
        category: CommandCategory.Game,
        description: t`View or set a config flag`,
    },
    {
        name: LEGACY_COMMAND.FLAGS,
        category: CommandCategory.Game,
        description: t`List all config flags`,
    },
];

const parseFlagName = (name: string | undefined): ConfigFlagName | null => {
    if (!name) return null;

    const normalizedName = name
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");

    if (!hasConfigFlag(normalizedName)) {
        return null;
    }

    return normalizedName;
};

const parseFlagValue = (value: string | undefined): boolean | null => {
    if (!value) return null;

    const normalizedValue = value.trim().toLowerCase();

    if (TRUE_FLAG_VALUES.has(normalizedValue)) {
        return true;
    }

    if (FALSE_FLAG_VALUES.has(normalizedValue)) {
        return false;
    }

    return null;
};

const toFlagState = (value: boolean): "ON" | "OFF" => {
    return value ? "ON" : "OFF";
};

const getFinalScoreAnnouncement = (score: ScoreState): string => {
    if (score[Team.RED] === score[Team.BLUE]) {
        return cn("🏁", score, t`Game ended in a tie!`);
    }

    const winnerTeam =
        score[Team.RED] > score[Team.BLUE] ? Team.RED : Team.BLUE;

    return cn(
        "🏁",
        score,
        t`Victory for the ${formatTeamName(winnerTeam)} team!`,
    );
};

export const legacyMetaDefinition: GameMetaDefinition = {
    name: GAME_MODE.LEGACY,
    label: "Legacy",
    stadium,
    registry,
    start: {
        state: LEGACY_STATE.KICKOFF,
        params: { forTeam: Team.RED },
    },
    room: {
        scoreLimit: 0,
        timeLimit: 10,
    },
    persistsMatches: true,
    createRuntime() {
        const gameConfig = createConfig(defaultConfig);

        return {
            commands: LEGACY_COMMAND_DEFINITIONS,
            createEngineOptions({ statEvents }) {
                return {
                    config: gameConfig,
                    globalSchema: legacyGlobalSchema,
                    ...(statEvents ? { statEvents } : {}),
                };
            },
            syncGameScore(engine, gameScoreStore) {
                const snapshot =
                    engine?.getGlobalStateSnapshot<LegacyGlobalSnapshot>() ??
                    null;

                gameScoreStore?.set(snapshot?.scores);
            },
            handleGameStop({ engine, gameScoreStore, room }) {
                const snapshot =
                    engine?.getGlobalStateSnapshot<LegacyGlobalSnapshot>() ??
                    null;
                const score = snapshot?.scores ?? null;
                const shouldShowScore =
                    score && score[Team.RED] + score[Team.BLUE] > 0;

                if (shouldShowScore) {
                    room.send({
                        message: getFinalScoreAnnouncement(score),
                        color:
                            score[Team.RED] === score[Team.BLUE]
                                ? COLOR.SYSTEM
                                : COLOR.SUCCESS,
                        to: "mixed",
                        sound: "notification",
                        style: "bold",
                    });
                }

                gameScoreStore?.reset();
            },
            handleCommand({ authorization, command, engine, player, room }) {
                switch (command.name) {
                    case LEGACY_COMMAND.FLAGS: {
                        const flagNames = getConfigFlagNames();

                        const [enabledFlags, disabledFlags] = flagNames.reduce<
                            [ConfigFlagName[], ConfigFlagName[]]
                        >(
                            (acc, flagName) => {
                                if (getConfigFlagValue(gameConfig, flagName)) {
                                    acc[0].push(flagName);
                                } else {
                                    acc[1].push(flagName);
                                }

                                return acc;
                            },
                            [[], []],
                        );

                        if (enabledFlags.length === 0) {
                            room.send({
                                message: t`⚙️ Available flags: ${flagNames.join(", ") || t`none`}.`,
                                color: COLOR.SYSTEM,
                                to: player.id,
                            });

                            return { hideMessage: true };
                        }

                        room.send({
                            message: t`⚙️ Available flags:`,
                            color: COLOR.SYSTEM,
                            to: player.id,
                        });

                        room.send({
                            message: t`• Enabled: ${enabledFlags.join(", ") || t`none`}`,
                            color: COLOR.SYSTEM,
                            to: player.id,
                        });

                        room.send({
                            message: t`• Disabled: ${disabledFlags.join(", ") || t`none`}`,
                            color: COLOR.SYSTEM,
                            to: player.id,
                        });

                        return { hideMessage: true };
                    }
                    case LEGACY_COMMAND.FLAG: {
                        if (!command.args[0]) {
                            room.send({
                                message: t`⚠️ Usage: !flag <FLAG_NAME> [VALUE].`,
                                color: COLOR.WARNING,
                                to: player.id,
                            });

                            return { hideMessage: true };
                        }

                        const requestedFlagName = parseFlagName(
                            command.args[0],
                        );

                        if (!requestedFlagName) {
                            room.send({
                                message: t`⚠️ Unknown flag. Use !flags to list available flags.`,
                                color: COLOR.WARNING,
                                to: player.id,
                            });

                            return { hideMessage: true };
                        }

                        const requestedFlagValue = command.args[1];
                        const flagDescription =
                            getConfigFlagDescription(requestedFlagName);
                        const flagState = toFlagState(
                            getConfigFlagValue(gameConfig, requestedFlagName),
                        );

                        if (requestedFlagValue === undefined) {
                            room.send({
                                message: t`⚙️ ${requestedFlagName}: ${flagState}.`,
                                color: COLOR.SYSTEM,
                                to: player.id,
                            });

                            room.send({
                                message: `ℹ️ ${flagDescription}`,
                                color: COLOR.SYSTEM,
                                to: player.id,
                            });

                            return { hideMessage: true };
                        }

                        if (!authorization.canUseManagementCommand(player)) {
                            room.send({
                                message: t`⚠️ Only admins can modify flags.`,
                                color: COLOR.WARNING,
                                to: player.id,
                            });

                            return { hideMessage: true };
                        }

                        if (engine?.isRunning()) {
                            room.send({
                                message: t`⚠️ Flags cannot be changed while a game is in progress.`,
                                color: COLOR.WARNING,
                                to: player.id,
                            });

                            return { hideMessage: true };
                        }

                        const parsedFlagValue =
                            parseFlagValue(requestedFlagValue);

                        if (parsedFlagValue === null) {
                            room.send({
                                message: t`⚠️ Invalid value. Use true/false, on/off, 1/0, yes/no.`,
                                color: COLOR.WARNING,
                                to: player.id,
                            });

                            return { hideMessage: true };
                        }

                        setConfigFlagValue(
                            gameConfig,
                            requestedFlagName,
                            parsedFlagValue,
                        );

                        const newFlagState = toFlagState(parsedFlagValue);

                        room.send({
                            message: t`⚙️ ${player.name} set ${requestedFlagName} to ${newFlagState}.`,
                            color: COLOR.ALERT,
                        });

                        room.send({
                            message: `ℹ️ ${requestedFlagName}: ${flagDescription}`,
                            color: COLOR.SYSTEM,
                        });

                        return { hideMessage: true };
                    }
                    default:
                        if (
                            LEGACY_COMMAND_DEFINITIONS.some(
                                (definition) =>
                                    definition.name === command.name,
                            )
                        ) {
                            room.send({
                                message: engine
                                    ? t`⚠️ You cannot use that command right now.`
                                    : t`⚠️ The game has not been started yet.`,
                                color: COLOR.WARNING,
                                to: player.id,
                            });

                            return { hideMessage: true };
                        }

                        return null;
                }
            },
        };
    },
};
