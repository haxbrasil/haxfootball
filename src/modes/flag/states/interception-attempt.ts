import { GameState, GameStateBall, GameStatePlayer } from "@runtime/engine";
import { $before, $dispose, $effect, $next, $event } from "@runtime/runtime";
import { DownState } from "@modes/flag/shared/rules/down";
import { ticks } from "@common/general/time";
import { $lockBall, $unlockBall } from "@modes/flag/hooks/physics";
import {
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $unsetLineOfScrimmage,
} from "@modes/flag/hooks/game";
import {
    getProjectedInterceptionPoint,
    getTravelInterceptionPoint,
} from "@modes/flag/shared/interaction/interception";
import { isOutOfBounds } from "@modes/flag/shared/field";
import { t } from "@lingui/core/macro";
import { PointLike } from "@common/math/geometry";
import { $createSharedCommandHandler } from "@modes/flag/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";
import { Stat } from "@modes/flag/stats";

const TIME_TO_CHECK_INTERCEPTION = ticks({ milliseconds: 100 });

type Frame = {
    state: GameState;
    blocker: GameStatePlayer;
    blockerIsOutOfBounds: boolean;
    intersectionFromTravel: PointLike | null;
    projectedIntersection: PointLike | null;
};

export function InterceptionAttempt({
    kickTime,
    playerId,
    downState,
    kickBallState,
    passerId,
    passProjectedInterceptionPoint,
}: {
    kickTime: number;
    playerId: number;
    downState: DownState;
    kickBallState: GameStateBall;
    passerId?: number;
    passProjectedInterceptionPoint?: PointLike | null;
}) {
    $lockBall();

    const { fieldPos } = downState;

    $setLineOfScrimmage(fieldPos);
    $setBallInactive();

    $dispose(() => {
        $unlockBall();
        $unsetLineOfScrimmage();
        $setBallActive();
    });

    function buildFrame(state: GameState): Frame | null {
        const blocker = state.players.find((player) => player.id === playerId);
        if (!blocker) return null;

        const interceptionTargets = [blocker.team] as const;
        const intersectionFromTravel = getTravelInterceptionPoint({
            previousBall: $before().ball,
            currentBall: state.ball,
            goals: interceptionTargets,
        });

        const projectedIntersection =
            state.tickNumber - kickTime >= TIME_TO_CHECK_INTERCEPTION
                ? getProjectedInterceptionPoint({
                      ball: state.ball,
                      goals: interceptionTargets,
                  })
                : null;

        return {
            state,
            blocker,
            blockerIsOutOfBounds: isOutOfBounds(blocker),
            intersectionFromTravel,
            projectedIntersection:
                passProjectedInterceptionPoint ?? projectedIntersection,
        };
    }

    // TODO: Check if player leaves

    function $advanceToInterception(args: {
        blocker: GameStatePlayer;
        intersectionPoint: PointLike;
    }) {
        $event({
            type: Stat.Interception,
            playerId: args.blocker.id,
            value: {
                team: args.blocker.team,
                down: downState.downAndDistance.down,
                distance: downState.downAndDistance.distance,
                startFieldPosition: downState.fieldPos,
                ...(passerId ? { passer: passerId } : {}),
            },
        });
        if (passerId) {
            $event({
                type: Stat.InterceptionThrown,
                playerId: passerId,
                value: {
                    team: downState.offensiveTeam,
                    down: downState.downAndDistance.down,
                    distance: downState.downAndDistance.distance,
                    startFieldPosition: downState.fieldPos,
                    interceptor: args.blocker.id,
                },
            });
        }

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

    function $handleTravelInterception(frame: Frame) {
        if (frame.blockerIsOutOfBounds) return;
        if (!frame.intersectionFromTravel) return;

        $advanceToInterception({
            blocker: frame.blocker,
            intersectionPoint: frame.intersectionFromTravel,
        });
    }

    function $handleProjectedInterception(frame: Frame) {
        if (frame.blockerIsOutOfBounds) return;
        if (!frame.projectedIntersection) return;

        $advanceToInterception({
            blocker: frame.blocker,
            intersectionPoint: frame.projectedIntersection,
        });
    }

    function $handleBlockedPass(frame: Frame) {
        if (frame.state.tickNumber - kickTime < TIME_TO_CHECK_INTERCEPTION) {
            return;
        }

        $next({
            to: "BLOCKED_PASS",
            params: {
                blockerId: playerId,
                downState,
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
        const frame = buildFrame(state);
        if (!frame) return;

        $handleTravelInterception(frame);
        $handleProjectedInterception(frame);
        $handleBlockedPass(frame);
    }

    return { run, command };
}
