import type {
    GameState,
    GameStateBall,
    GameStatePlayer,
} from "@runtime/engine";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { type FieldTeam } from "@runtime/models";
import { t } from "@lingui/core/macro";
import { opposite, type FieldPosition } from "@common/game/game";
import {
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { $lockBall, $unlockBall } from "@meta/legacy/hooks/physics";
import {
    getProjectedInterceptionPoint,
    getTravelInterceptionPoint,
} from "@meta/legacy/shared/interception";
import { type PointLike } from "@common/math/geometry";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";

const TIME_TO_CHECK_INTERCEPTION = ticks({ milliseconds: 200 });

type Frame = {
    state: GameState;
    blocker: GameStatePlayer;
    intersectionFromTravel: PointLike | null;
    projectedIntersection: PointLike | null;
};

export function ExtraPointInterceptionAttempt({
    kickTime,
    playerId,
    offensiveTeam,
    fieldPos,
    kickBallState,
}: {
    kickTime: number;
    playerId: number;
    offensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
    kickBallState: GameStateBall;
}) {
    $lockBall();
    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();
    $setBallInactive();

    const goals = [offensiveTeam, opposite(offensiveTeam)] as const;

    $dispose(() => {
        $unlockBall();
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
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
            intersectionFromTravel,
            projectedIntersection,
        };
    }

    function $handleTravelInterception(frame: Frame) {
        if (!frame.intersectionFromTravel) return;

        $effect(($) => {
            $.send({
                message: t`🛡️ INTERCEPTION by ${frame.blocker.name}!`,
                color: COLOR.SPECIAL,
            });
        });

        $next({
            to: "EXTRA_POINT_RUN",
            params: {
                playerId: frame.blocker.id,
                ballTeam: frame.blocker.team,
                originalOffensiveTeam: offensiveTeam,
                fieldPos,
                interceptionPath: {
                    start: {
                        x: kickBallState.x,
                        y: kickBallState.y,
                    },
                    end: {
                        x: frame.intersectionFromTravel.x,
                        y: frame.intersectionFromTravel.y,
                    },
                },
            },
        });
    }

    function $handleProjectedInterception(frame: Frame) {
        if (!frame.projectedIntersection) return;

        $effect(($) => {
            $.send({
                message: t`🛡️ INTERCEPTION by ${frame.blocker.name}!`,
                color: COLOR.SPECIAL,
            });
        });

        $next({
            to: "EXTRA_POINT_RUN",
            params: {
                playerId: frame.blocker.id,
                ballTeam: frame.blocker.team,
                originalOffensiveTeam: offensiveTeam,
                fieldPos,
                interceptionPath: {
                    start: {
                        x: kickBallState.x,
                        y: kickBallState.y,
                    },
                    end: {
                        x: frame.projectedIntersection.x,
                        y: frame.projectedIntersection.y,
                    },
                },
            },
        });
    }

    function $handleBlockedPass(frame: Frame) {
        if (frame.state.tickNumber - kickTime < TIME_TO_CHECK_INTERCEPTION)
            return;

        $next({
            to: "EXTRA_POINT_BLOCKED_PASS",
            params: {
                blockerId: frame.blocker.id,
                offensiveTeam,
                fieldPos,
            },
        });
    }

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
        const frame = buildFrame(state);
        if (!frame) return;

        $handleTravelInterception(frame);
        $handleProjectedInterception(frame);
        $handleBlockedPass(frame);
    }

    return { run, command };
}
