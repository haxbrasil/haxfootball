import { GameState, GameStateBall, GameStatePlayer } from "@runtime/engine";
import { $before, $dispose, $effect, $next, $stat } from "@runtime/runtime";
import { DownState } from "@modes/classic/shared/down";
import { ticks } from "@common/general/time";
import { opposite } from "@common/game/game";
import { $lockBall, $unlockBall } from "@modes/classic/hooks/physics";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@modes/classic/hooks/game";
import {
    getProjectedInterceptionPoint,
    getTravelInterceptionPoint,
} from "@modes/classic/shared/interception";
import { isOutOfBounds } from "@modes/classic/shared/stadium";
import { t } from "@lingui/core/macro";
import { PointLike } from "@common/math/geometry";
import { $createSharedCommandHandler } from "@modes/classic/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";
import { Stat } from "@modes/classic/stats";

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
}: {
    kickTime: number;
    playerId: number;
    downState: DownState;
    kickBallState: GameStateBall;
    passerId?: number;
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

    function buildFrame(state: GameState): Frame | null {
        const blocker = state.players.find((player) => player.id === playerId);
        if (!blocker) return null;

        const intersectionFromTravel = getTravelInterceptionPoint({
            previousBall: $before().ball,
            currentBall: state.ball,
            goals,
        });

        const projectedIntersection =
            state.tickNumber - kickTime >= TIME_TO_CHECK_INTERCEPTION
                ? getProjectedInterceptionPoint({ ball: state.ball, goals })
                : null;

        return {
            state,
            blocker,
            blockerIsOutOfBounds: isOutOfBounds(blocker),
            intersectionFromTravel,
            projectedIntersection,
        };
    }

    // TODO: Check if player leaves

    function $advanceToInterception(args: {
        blocker: GameStatePlayer;
        intersectionPoint: PointLike;
    }) {
        $stat({
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
            $stat({
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
