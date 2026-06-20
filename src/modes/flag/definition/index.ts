import { COLOR } from "@common/general/color";
import { t } from "@lingui/core/macro";
import {
    createConfig,
    defaultConfig,
    getConfigFlagDescription,
    getConfigFlagNames,
    getConfigFlagValue,
    setConfigFlagValue,
    type ConfigFlagName,
} from "@modes/flag/config";
import { flagGlobalSchema } from "@modes/flag/global";
import { registry, stadium } from "@modes/flag/registry";
import { FLAG_COMMAND } from "@modes/flag/shared/commands/names";
import { cn } from "@modes/flag/shared/presentation/message";
import { getRestartDownState } from "@modes/flag/shared/rules/down";
import type { GameModeDefinition } from "@modes/types";
import { GAME_MODE } from "@modes/types";
import type { GlobalSchemaState } from "@runtime/global";
import { Team } from "@runtime/models";
import { FLAG_COMMAND_DEFINITIONS } from "./commands";
import { createEndGameController, getFinalScoreAnnouncement } from "./end-game";
import { parseFlagName, parseFlagValue, toFlagState } from "./flags";

type FlagGlobalSnapshot = GlobalSchemaState<typeof flagGlobalSchema>;

export const FLAG_STATE = {
    PRESNAP: "PRESNAP",
} as const;

export const flagModeDefinition: GameModeDefinition = {
    name: GAME_MODE.FLAG,
    label: "Flag",
    stadium,
    registry,
    start: {
        state: FLAG_STATE.PRESNAP,
        params: {
            downState: getRestartDownState(Team.RED),
        },
    },
    room: {
        scoreLimit: 0,
        timeLimit: 7,
    },
    persistsMatches: false,
    createRuntime() {
        const gameConfig = createConfig(defaultConfig);
        const endGame = createEndGameController();

        return {
            commands: FLAG_COMMAND_DEFINITIONS,
            createEngineOptions({ matchEvents }) {
                endGame.reset();

                return {
                    config: gameConfig,
                    globalSchema: flagGlobalSchema,
                    ...(matchEvents ? { matchEvents } : {}),
                };
            },
            syncGameScore(engine, gameScoreStore) {
                const snapshot =
                    engine?.getGlobalStateSnapshot<FlagGlobalSnapshot>() ??
                    null;

                gameScoreStore?.set(snapshot?.scores);
            },
            getCompletedResult() {
                return endGame.getCompletedResult();
            },
            handleGameTickEnd({ engine, gameScoreStore, room }) {
                const nativeScores = room.getScores();

                const snapshot =
                    engine?.getGlobalStateSnapshot<FlagGlobalSnapshot>() ??
                    null;

                const timeLimitSeconds =
                    typeof nativeScores?.timeLimit === "number"
                        ? nativeScores.timeLimit
                        : 0;

                const elapsedSeconds =
                    typeof nativeScores?.time === "number"
                        ? nativeScores.time
                        : 0;

                const result = endGame.onTick({
                    elapsedSeconds,
                    score: snapshot?.scores ?? null,
                    stateName: engine?.getCurrentStateName() ?? null,
                    timeLimitSeconds,
                });

                if (
                    snapshot?.scores &&
                    endGame.consumeTiedOverageAnnouncement()
                ) {
                    room.send({
                        message: cn(
                            "⏱️",
                            snapshot.scores,
                            t`Time limit reached with a tied game, overtime is active and the next score wins.`,
                        ),
                        color: COLOR.SYSTEM,
                        to: "mixed",
                        sound: "notification",
                        style: "bold",
                    });
                }

                if (!result) return;

                gameScoreStore?.set(result.finalScore);
                room.stopGame();
            },
            handleGameStop({ engine, gameScoreStore, room }) {
                const snapshot =
                    engine?.getGlobalStateSnapshot<FlagGlobalSnapshot>() ??
                    null;

                const score =
                    endGame.getCompletedResult()?.finalScore ??
                    snapshot?.scores ??
                    null;

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

                endGame.reset();
                gameScoreStore?.reset();
            },
            handleCommand({ authorization, command, engine, player, room }) {
                switch (command.name) {
                    case FLAG_COMMAND.FLAGS: {
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
                    case FLAG_COMMAND.FLAG: {
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
                            FLAG_COMMAND_DEFINITIONS.some(
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
