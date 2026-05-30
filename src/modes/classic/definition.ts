import { COLOR } from "@common/general/color";
import { type ScoreState } from "@common/game/game";
import type { CommandDefinition } from "@core/commands";
import { t } from "@lingui/core/macro";
import { classicGlobalSchema } from "@modes/classic/global";
import { registry, stadium } from "@modes/classic/registry";
import { cn, formatTeamName } from "@modes/classic/shared/message";
import { CLASSIC_COMMAND } from "@modes/classic/shared/commands/names";
import type { GameModeDefinition } from "@modes/types";
import { GAME_MODE } from "@modes/types";
import { Team, type FieldTeam } from "@runtime/models";
import type { GlobalSchemaState } from "@runtime/global";
import { CommandCategory } from "@room/shared/domain/command-categories";
import { opposite } from "@common/game/game";
import { SCORES } from "@modes/classic/shared/scoring";
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

type ClassicGlobalSnapshot = GlobalSchemaState<typeof classicGlobalSchema>;

export const CLASSIC_STATE = {
    KICKOFF: "KICKOFF",
} as const;

const CLASSIC_COMMAND_DEFINITIONS: CommandDefinition[] = [
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

namespace Flags {
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

    export const parseFlagName = (
        name: string | undefined,
    ): ConfigFlagName | null => {
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

    export const parseFlagValue = (
        value: string | undefined,
    ): boolean | null => {
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

    export const toFlagState = (value: boolean): "ON" | "OFF" => {
        return value ? "ON" : "OFF";
    };
}

namespace EndGame {
    type ClassicEndGameReason = "regulation-ended" | "overtime-score";
    type ClassicMatchResult = {
        status: "complete";
        expectedTimeReached: boolean;
        overage: boolean;
        winnerTeam: FieldTeam;
        loserTeam: FieldTeam;
        finalScore: ScoreState;
        reason: ClassicEndGameReason;
        elapsedSeconds: number;
    };
    type ScoreEvent = {
        team: FieldTeam;
        points: number;
        scoreBefore: ScoreState;
        scoreAfter: ScoreState;
    };

    const LEGAL_END_STATES = new Set([
        "PRESNAP",
        "KICKOFF",
        "PUNT",
        "SAFETY",
        "EXTRA_POINT",
        "EXTRA_POINT_RETRY",
    ]);

    const cloneScore = (score: ScoreState): ScoreState => ({
        [Team.RED]: score[Team.RED],
        [Team.BLUE]: score[Team.BLUE],
    });

    const isScoreTied = (score: ScoreState): boolean =>
        score[Team.RED] === score[Team.BLUE];

    const getWinnerTeam = (score: ScoreState): FieldTeam | null => {
        if (isScoreTied(score)) return null;

        return score[Team.RED] > score[Team.BLUE] ? Team.RED : Team.BLUE;
    };

    const addScore = (
        score: ScoreState,
        team: FieldTeam,
        points: number,
    ): ScoreState => ({
        ...score,
        [team]: score[team] + points,
    });

    const getScoreEvent = (
        previousScore: ScoreState | null,
        score: ScoreState,
    ): ScoreEvent | null => {
        if (!previousScore) return null;

        const redDelta = score[Team.RED] - previousScore[Team.RED];
        const blueDelta = score[Team.BLUE] - previousScore[Team.BLUE];

        if (redDelta > 0 && blueDelta === 0) {
            return {
                team: Team.RED,
                points: redDelta,
                scoreBefore: cloneScore(previousScore),
                scoreAfter: cloneScore(score),
            };
        }

        if (blueDelta > 0 && redDelta === 0) {
            return {
                team: Team.BLUE,
                points: blueDelta,
                scoreBefore: cloneScore(previousScore),
                scoreAfter: cloneScore(score),
            };
        }

        return null;
    };

    const shouldAllowFinalExtraPointAttempt = (
        scoreAfterTouchdown: ScoreState,
        scoringTeam: FieldTeam,
    ): boolean => {
        const margin =
            scoreAfterTouchdown[scoringTeam] -
            scoreAfterTouchdown[opposite(scoringTeam)];

        return margin >= -2 && margin <= 0;
    };

    export function createController() {
        let expectedTimeReached = false;
        let overage = false;
        let previousScore: ScoreState | null = null;
        let pendingStop: ClassicMatchResult | null = null;
        let completedResult: ClassicMatchResult | null = null;
        let awaitingFinalExtraPointAttempt: { scoringTeam: FieldTeam } | null =
            null;
        let tiedOverageAnnouncementPending = false;
        let tiedOverageAnnounced = false;

        const reset = () => {
            expectedTimeReached = false;
            overage = false;
            previousScore = null;
            pendingStop = null;
            completedResult = null;
            awaitingFinalExtraPointAttempt = null;
            tiedOverageAnnouncementPending = false;
            tiedOverageAnnounced = false;
        };

        const buildResult = ({
            elapsedSeconds,
            finalScore,
            reason,
        }: {
            elapsedSeconds: number;
            finalScore: ScoreState;
            reason: ClassicEndGameReason;
        }): ClassicMatchResult | null => {
            const winnerTeam = getWinnerTeam(finalScore);
            if (!winnerTeam) return null;

            return {
                status: "complete",
                expectedTimeReached,
                overage,
                winnerTeam,
                loserTeam: opposite(winnerTeam),
                finalScore: cloneScore(finalScore),
                reason,
                elapsedSeconds,
            };
        };

        const markPendingStop = (result: ClassicMatchResult | null) => {
            pendingStop = result;
        };

        const markTiedOverage = () => {
            overage = true;

            if (!tiedOverageAnnounced) {
                tiedOverageAnnouncementPending = true;
                tiedOverageAnnounced = true;
            }
        };

        const completeIfLegal = (stateName: string | null) => {
            if (
                !pendingStop ||
                !stateName ||
                !LEGAL_END_STATES.has(stateName)
            ) {
                return null;
            }

            completedResult = pendingStop;

            return completedResult;
        };

        const resolveAwaitingFinalExtraPointAttempt = ({
            elapsedSeconds,
            score,
            scoreEvent,
            stateName,
        }: {
            elapsedSeconds: number;
            score: ScoreState;
            scoreEvent: ScoreEvent | null;
            stateName: string | null;
        }) => {
            if (!awaitingFinalExtraPointAttempt) return false;

            const scoringTeam = awaitingFinalExtraPointAttempt.scoringTeam;
            const resolvedByScore =
                scoreEvent?.team === scoringTeam &&
                (scoreEvent.points === SCORES.EXTRA_POINT ||
                    scoreEvent.points === SCORES.TWO_POINT);
            const resolvedWithoutScore = stateName === "KICKOFF";

            if (!resolvedByScore && !resolvedWithoutScore) {
                return true;
            }

            awaitingFinalExtraPointAttempt = null;

            if (isScoreTied(score)) {
                markTiedOverage();
                markPendingStop(null);
                return false;
            }

            markPendingStop(
                buildResult({
                    elapsedSeconds,
                    finalScore: score,
                    reason: "regulation-ended",
                }),
            );

            return false;
        };

        const onTick = ({
            elapsedSeconds,
            score,
            stateName,
            timeLimitSeconds,
        }: {
            elapsedSeconds: number;
            score: ScoreState | null;
            stateName: string | null;
            timeLimitSeconds: number;
        }): ClassicMatchResult | null => {
            if (!score) {
                previousScore = null;
                return null;
            }

            const scoreEvent = getScoreEvent(previousScore, score);
            previousScore = cloneScore(score);

            if (timeLimitSeconds > 0 && elapsedSeconds >= timeLimitSeconds) {
                expectedTimeReached = true;
            }

            if (!expectedTimeReached) return null;

            if (
                resolveAwaitingFinalExtraPointAttempt({
                    elapsedSeconds,
                    score,
                    scoreEvent,
                    stateName,
                })
            ) {
                return null;
            }

            if (pendingStop && !scoreEvent) {
                return completeIfLegal(stateName);
            }

            if (
                scoreEvent?.points === SCORES.TOUCHDOWN &&
                isScoreTied(scoreEvent.scoreBefore) &&
                !isScoreTied(score)
            ) {
                overage = true;
                markPendingStop(
                    buildResult({
                        elapsedSeconds,
                        finalScore: addScore(
                            score,
                            scoreEvent.team,
                            SCORES.EXTRA_POINT,
                        ),
                        reason: "overtime-score",
                    }),
                );
            } else if (scoreEvent?.points === SCORES.TOUCHDOWN) {
                if (shouldAllowFinalExtraPointAttempt(score, scoreEvent.team)) {
                    awaitingFinalExtraPointAttempt = {
                        scoringTeam: scoreEvent.team,
                    };
                    markPendingStop(null);

                    if (isScoreTied(score)) {
                        markTiedOverage();
                    }

                    return null;
                }

                markPendingStop(
                    buildResult({
                        elapsedSeconds,
                        finalScore: score,
                        reason: overage ? "overtime-score" : "regulation-ended",
                    }),
                );
            } else if (isScoreTied(score)) {
                markTiedOverage();
                markPendingStop(null);
            } else {
                markPendingStop(
                    buildResult({
                        elapsedSeconds,
                        finalScore: score,
                        reason: overage ? "overtime-score" : "regulation-ended",
                    }),
                );
            }

            return completeIfLegal(stateName);
        };

        return {
            consumeTiedOverageAnnouncement: () => {
                const shouldAnnounce = tiedOverageAnnouncementPending;
                tiedOverageAnnouncementPending = false;

                return shouldAnnounce;
            },
            getCompletedResult: () => completedResult,
            onTick,
            reset,
        };
    }

    export const getFinalScoreAnnouncement = (score: ScoreState): string => {
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
}

export const classicModeDefinition: GameModeDefinition = {
    name: GAME_MODE.CLASSIC,
    label: "Classic",
    stadium,
    registry,
    start: {
        state: CLASSIC_STATE.KICKOFF,
        params: { forTeam: Team.RED },
    },
    room: {
        scoreLimit: 0,
        timeLimit: 10,
    },
    persistsMatches: true,
    createRuntime() {
        const gameConfig = createConfig(defaultConfig);
        const endGame = EndGame.createController();

        return {
            commands: CLASSIC_COMMAND_DEFINITIONS,
            createEngineOptions({ statEvents }) {
                endGame.reset();

                return {
                    config: gameConfig,
                    globalSchema: classicGlobalSchema,
                    ...(statEvents ? { statEvents } : {}),
                };
            },
            syncGameScore(engine, gameScoreStore) {
                const snapshot =
                    engine?.getGlobalStateSnapshot<ClassicGlobalSnapshot>() ??
                    null;

                gameScoreStore?.set(snapshot?.scores);
            },
            handleGameTickEnd({ engine, gameScoreStore, room }) {
                const nativeScores = room.getScores();

                const snapshot =
                    engine?.getGlobalStateSnapshot<ClassicGlobalSnapshot>() ??
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
                    engine?.getGlobalStateSnapshot<ClassicGlobalSnapshot>() ??
                    null;

                const score =
                    endGame.getCompletedResult()?.finalScore ??
                    snapshot?.scores ??
                    null;

                const shouldShowScore =
                    score && score[Team.RED] + score[Team.BLUE] > 0;

                if (shouldShowScore) {
                    room.send({
                        message: EndGame.getFinalScoreAnnouncement(score),
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
                    case CLASSIC_COMMAND.FLAGS: {
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
                    case CLASSIC_COMMAND.FLAG: {
                        if (!command.args[0]) {
                            room.send({
                                message: t`⚠️ Usage: !flag <FLAG_NAME> [VALUE].`,
                                color: COLOR.WARNING,
                                to: player.id,
                            });

                            return { hideMessage: true };
                        }

                        const requestedFlagName = Flags.parseFlagName(
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
                        const flagState = Flags.toFlagState(
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
                            Flags.parseFlagValue(requestedFlagValue);

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

                        const newFlagState = Flags.toFlagState(parsedFlagValue);

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
                            CLASSIC_COMMAND_DEFINITIONS.some(
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
