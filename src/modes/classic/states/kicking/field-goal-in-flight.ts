import type { GameState } from "@runtime/engine";
import { ticks } from "@common/general/time";
import { opposite } from "@common/game/game";
import { t } from "@lingui/core/macro";
import { $dispose, $effect, $next, $event } from "@runtime/runtime";
import { $global } from "@modes/classic/hooks/global";
import { $setBallActive } from "@modes/classic/hooks/game";
import { $lockBall, $unlockBall } from "@modes/classic/hooks/physics";
import {
    DownState,
    getInitialDownState,
} from "@modes/classic/shared/rules/down";
import { SCORES } from "@modes/classic/shared/rules/scoring";
import { cn } from "@modes/classic/shared/presentation/message";
import { $createSharedCommandHandler } from "@modes/classic/shared/commands";
import {
    calculateDirectionalGain,
    getDistanceToGoalLine,
    getGoalLine,
    isBallOutOfBounds,
    isWithinGoalPosts,
} from "@modes/classic/shared/field";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";
import { Stat } from "@modes/classic/stats";
import { getSpeedSquared } from "@common/math/geometry";

const FIELD_GOAL_RESULT_DELAY = ticks({ seconds: 2 });
const FIELD_GOAL_SUCCESS_DELAY = ticks({ seconds: 3 });
const BALL_STOPPED_SPEED = 0.05;
const BALL_STOPPED_SPEED_SQUARED = BALL_STOPPED_SPEED * BALL_STOPPED_SPEED;

export function FieldGoalInFlight({
    downState,
    kickerId,
}: {
    downState: DownState;
    kickerId?: number;
}) {
    const { offensiveTeam, fieldPos } = downState;
    const defensiveTeam = opposite(offensiveTeam);
    const failureDownState = getInitialDownState(
        defensiveTeam,
        fieldPos,
        downState.lastBallY,
    );
    const goalLine = getGoalLine(defensiveTeam);
    const goalLineX = goalLine.start.x;
    const attemptYards = getDistanceToGoalLine(offensiveTeam, fieldPos);

    $lockBall();
    $setBallActive();

    $dispose(() => {
        $unlockBall();
    });

    function command(player: PlayerObject, spec: CommandSpec) {
        return $createSharedCommandHandler({
            options: {
                undo: true,
                info: { downState },
            },
            player,
            spec,
        });
    }

    function run(state: GameState) {
        const crossedGoalLine =
            calculateDirectionalGain(offensiveTeam, state.ball.x - goalLineX) >=
            0;

        if (crossedGoalLine) {
            if (isWithinGoalPosts(state.ball, defensiveTeam)) {
                $global((state) =>
                    state.incrementScore(offensiveTeam, SCORES.FIELD_GOAL),
                );
                if (kickerId) {
                    $event({
                        type: Stat.FieldGoalMade,
                        playerId: kickerId,
                        value: {
                            team: offensiveTeam,
                            down: downState.downAndDistance.down,
                            distance: downState.downAndDistance.distance,
                            startFieldPosition: downState.fieldPos,
                            yards: attemptYards,
                            endFieldPosition: {
                                side: defensiveTeam,
                                yards: 0,
                            },
                        },
                    });
                }

                const { scores } = $global();

                $effect(($) => {
                    $.send({
                        message: cn("✅", scores, t`field goal is good!`),
                        color: COLOR.SUCCESS,
                        to: "mixed",
                        sound: "notification",
                        style: "bold",
                    });
                });

                $next({
                    to: "KICKOFF",
                    params: {
                        forTeam: offensiveTeam,
                    },
                    wait: FIELD_GOAL_SUCCESS_DELAY,
                });
            }

            $effect(($) => {
                $.send({
                    message: t`❌ Field goal is no good.`,
                    color: COLOR.WARNING,
                });
            });
            if (kickerId) {
                $event({
                    type: Stat.FieldGoalMissed,
                    playerId: kickerId,
                    value: {
                        team: offensiveTeam,
                        down: downState.downAndDistance.down,
                        distance: downState.downAndDistance.distance,
                        startFieldPosition: downState.fieldPos,
                        yards: attemptYards,
                    },
                });
            }

            $next({
                to: "PRESNAP",
                params: {
                    downState: failureDownState,
                },
                wait: FIELD_GOAL_RESULT_DELAY,
            });
        }

        if (isBallOutOfBounds(state.ball)) {
            $effect(($) => {
                $.send({
                    message: t`❌ Field goal went out of bounds.`,
                    color: COLOR.WARNING,
                });
            });
            if (kickerId) {
                $event({
                    type: Stat.FieldGoalMissed,
                    playerId: kickerId,
                    value: {
                        team: offensiveTeam,
                        down: downState.downAndDistance.down,
                        distance: downState.downAndDistance.distance,
                        startFieldPosition: downState.fieldPos,
                        yards: attemptYards,
                    },
                });
            }

            $next({
                to: "PRESNAP",
                params: {
                    downState: failureDownState,
                },
                wait: FIELD_GOAL_RESULT_DELAY,
            });
        }

        const isStopped =
            getSpeedSquared(state.ball) <= BALL_STOPPED_SPEED_SQUARED;

        if (isStopped) {
            $effect(($) => {
                $.send({
                    message: t`❌ Field goal is no good.`,
                    color: COLOR.WARNING,
                });
            });
            if (kickerId) {
                $event({
                    type: Stat.FieldGoalMissed,
                    playerId: kickerId,
                    value: {
                        team: offensiveTeam,
                        down: downState.downAndDistance.down,
                        distance: downState.downAndDistance.distance,
                        startFieldPosition: downState.fieldPos,
                        yards: attemptYards,
                    },
                });
            }

            $next({
                to: "PRESNAP",
                params: {
                    downState: failureDownState,
                },
                wait: FIELD_GOAL_RESULT_DELAY,
            });
        }
    }

    return { run, command };
}
