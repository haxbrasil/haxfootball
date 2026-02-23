import { GameState, GameStateBall, GameStatePlayer } from "@runtime/engine";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import { DownState } from "@meta/legacy/shared/down";
import { ticks } from "@common/general/time";
import { opposite } from "@common/game/game";
import { $lockBall, $unlockBall } from "@meta/legacy/hooks/physics";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import {
    getProjectedInterceptionPoint,
    getTravelInterceptionPoint,
} from "@meta/legacy/shared/interception";
import { t } from "@lingui/core/macro";
import { PointLike } from "@common/math/geometry";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";

const TIME_TO_CHECK_INTERCEPTION = ticks({ milliseconds: 100 });

export function InterceptionAttempt({
    kickTime,
    playerId,
    downState,
    kickBallState,
}: {
    kickTime: number;
    playerId: number;
    downState: DownState;
    kickBallState: GameStateBall;
}) {
    $lockBall();

    const { offensiveTeam, fieldPos, downAndDistance } = downState;

    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);
    $setBallInactive();

    const goals = [offensiveTeam, opposite(offensiveTeam)] as const;

    $dispose(() => {
        $unlockBall();
        $unsetLineOfScrimmage();
        $setBallActive();
        $unsetFirstDownLine();
    });

    // TODO: Check if player leaves

    function $advanceToInterception(args: {
        blocker: GameStatePlayer;
        intersectionPoint: PointLike;
    }) {
        $effect(($) => {
            $.send({
                message: t`🛡️ INTERCEPTION by ${args.blocker.name}!`,
                color: COLOR.SPECIAL,
            });
        });

        $next({
            to: "INTERCEPTION",
            params: {
                playerId,
                intersectionPoint: args.intersectionPoint,
                ballState: kickBallState,
                playerTeam: args.blocker.team,
            },
        });
    }

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
        const blocker = state.players.find((p) => p.id === playerId);
        if (!blocker) return;

        const intersectionFromTravel = getTravelInterceptionPoint({
            previousBall: $before().ball,
            currentBall: state.ball,
            goals,
        });

        if (intersectionFromTravel) {
            $advanceToInterception({
                blocker,
                intersectionPoint: intersectionFromTravel,
            });
        }

        if (state.tickNumber - kickTime < TIME_TO_CHECK_INTERCEPTION) {
            return;
        }

        const projectedIntersection = getProjectedInterceptionPoint({
            ball: state.ball,
            goals,
        });

        if (projectedIntersection) {
            $advanceToInterception({
                blocker,
                intersectionPoint: projectedIntersection,
            });
        }

        $next({
            to: "BLOCKED_PASS",
            params: {
                blockerId: playerId,
                downState,
            },
        });
    }

    return { run, command };
}
