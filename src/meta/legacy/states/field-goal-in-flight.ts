import type { GameState } from "@runtime/engine";
import { ticks } from "@common/general/time";
import { opposite } from "@common/game/game";
import { t } from "@lingui/core/macro";
import { $dispose, $effect, $next } from "@runtime/runtime";
import { $global } from "@meta/legacy/hooks/global";
import { $setBallActive } from "@meta/legacy/hooks/game";
import { $lockBall, $unlockBall } from "@meta/legacy/hooks/physics";
import { DownState, getInitialDownState } from "@meta/legacy/shared/down";
import { SCORES } from "@meta/legacy/shared/scoring";
import { cn } from "@meta/legacy/shared/message";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import {
    calculateDirectionalGain,
    getGoalLine,
    isBallOutOfBounds,
    isWithinGoalPosts,
} from "@meta/legacy/shared/stadium";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";

const FIELD_GOAL_RESULT_DELAY = ticks({ seconds: 2 });
const FIELD_GOAL_SUCCESS_DELAY = ticks({ seconds: 3 });
const BALL_STOPPED_SPEED = 0.05;
const BALL_STOPPED_SPEED_SQUARED = BALL_STOPPED_SPEED * BALL_STOPPED_SPEED;

export function FieldGoalInFlight({ downState }: { downState: DownState }) {
    const { offensiveTeam, fieldPos } = downState;
    const defensiveTeam = opposite(offensiveTeam);
    const failureDownState = getInitialDownState(
        defensiveTeam,
        fieldPos,
        downState.lastBallY,
    );
    const goalLine = getGoalLine(defensiveTeam);
    const goalLineX = goalLine.start.x;

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

            $next({
                to: "PRESNAP",
                params: {
                    downState: failureDownState,
                },
                wait: FIELD_GOAL_RESULT_DELAY,
            });
        }

        const speedSquared =
            state.ball.xspeed * state.ball.xspeed +
            state.ball.yspeed * state.ball.yspeed;
        const isStopped = speedSquared <= BALL_STOPPED_SPEED_SQUARED;

        if (isStopped) {
            $effect(($) => {
                $.send({
                    message: t`❌ Field goal is no good.`,
                    color: COLOR.WARNING,
                });
            });

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
