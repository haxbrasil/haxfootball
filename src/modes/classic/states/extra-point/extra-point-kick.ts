import type { GameState } from "@runtime/engine";
import { ticks } from "@common/general/time";
import { opposite } from "@common/game/game";
import { t } from "@lingui/core/macro";
import { $dispose, $effect, $next, $stat, $tick } from "@runtime/runtime";
import { $global } from "@modes/classic/hooks/global";
import { $setBallActive } from "@modes/classic/hooks/game";
import { $lockBall, $unlockBall } from "@modes/classic/hooks/physics";
import { type FieldTeam } from "@runtime/models";
import { SCORES } from "@modes/classic/shared/rules/scoring";
import { cn } from "@modes/classic/shared/presentation/message";
import { $createSharedCommandHandler } from "@modes/classic/shared/commands";
import {
    calculateDirectionalGain,
    getGoalLine,
    isBallOutOfBounds,
    isWithinGoalPosts,
} from "@modes/classic/shared/field";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";
import { Stat } from "@modes/classic/stats";
import { getSpeedSquared } from "@common/math/geometry";

const EXTRA_POINT_RESULT_DELAY = ticks({ seconds: 2 });
const EXTRA_POINT_SUCCESS_DELAY = ticks({ seconds: 2 });
const TOO_WEAK_CHECK_DELAY = ticks({ seconds: 1 });
const BALL_STOPPED_SPEED = 0.05;
const BALL_STOPPED_SPEED_SQUARED = BALL_STOPPED_SPEED * BALL_STOPPED_SPEED;

export function ExtraPointKick({
    offensiveTeam,
    kickerId,
}: {
    offensiveTeam: FieldTeam;
    kickerId?: number;
}) {
    const defensiveTeam = opposite(offensiveTeam);
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
                info: { stateMessage: t`Extra point` },
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
                    state.incrementScore(offensiveTeam, SCORES.EXTRA_POINT),
                );
                if (kickerId) {
                    $stat({
                        type: Stat.ExtraPointMade,
                        playerId: kickerId,
                        value: {
                            team: offensiveTeam,
                        },
                    });
                }

                const { scores } = $global();

                $effect(($) => {
                    $.send({
                        message: cn("✅", scores, t`PAT is good!`),
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
                    wait: EXTRA_POINT_SUCCESS_DELAY,
                });
            }

            $effect(($) => {
                $.send({
                    message: t`❌ PAT is no good.`,
                    color: COLOR.WARNING,
                });
            });
            if (kickerId) {
                $stat({
                    type: Stat.ExtraPointMissed,
                    playerId: kickerId,
                    value: {
                        team: offensiveTeam,
                    },
                });
            }

            $next({
                to: "KICKOFF",
                params: {
                    forTeam: offensiveTeam,
                },
                wait: EXTRA_POINT_RESULT_DELAY,
            });
        }

        if (isBallOutOfBounds(state.ball)) {
            $effect(($) => {
                $.send({
                    message: t`❌ PAT went out of bounds.`,
                    color: COLOR.WARNING,
                });
            });
            if (kickerId) {
                $stat({
                    type: Stat.ExtraPointMissed,
                    playerId: kickerId,
                    value: {
                        team: offensiveTeam,
                    },
                });
            }

            $next({
                to: "KICKOFF",
                params: {
                    forTeam: offensiveTeam,
                },
                wait: EXTRA_POINT_RESULT_DELAY,
            });
        }

        const isStopped =
            getSpeedSquared(state.ball) <= BALL_STOPPED_SPEED_SQUARED;
        const { self: elapsedTicks } = $tick();

        if (elapsedTicks < TOO_WEAK_CHECK_DELAY) return;
        if (isStopped) {
            $effect(($) => {
                $.send({
                    message: t`❌ PAT is no good.`,
                    color: COLOR.WARNING,
                });
            });
            if (kickerId) {
                $stat({
                    type: Stat.ExtraPointMissed,
                    playerId: kickerId,
                    value: {
                        team: offensiveTeam,
                    },
                });
            }

            $next({
                to: "KICKOFF",
                params: {
                    forTeam: offensiveTeam,
                },
                wait: EXTRA_POINT_RESULT_DELAY,
            });
        }
    }

    return { run, command };
}
