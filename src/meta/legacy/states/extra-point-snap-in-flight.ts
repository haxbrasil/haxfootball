import type { GameState, GameStatePlayer } from "@runtime/engine";
import { $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { type FieldPosition } from "@common/game/game";
import { t } from "@lingui/core/macro";
import { type FieldTeam } from "@runtime/models";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import { cn } from "@meta/legacy/shared/message";
import {
    findEligibleBallCatcher,
    findTouchdownAwareBallCatcher,
    findOutOfBoundsBallCatcher,
} from "@meta/legacy/shared/reception";
import { isTouchdown } from "@meta/legacy/shared/scoring";
import {
    isInExtraPointZone,
    isBallOutOfBounds,
} from "@meta/legacy/shared/stadium";
import {
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";

type Frame = {
    state: GameState;
    outOfBoundsCatcher: GameStatePlayer | null;
    offensiveCatcher: GameStatePlayer | null;
    defensiveCatcher: GameStatePlayer | null;
    defensiveOutOfBoundsCatcher: GameStatePlayer | null;
};

export function ExtraPointSnapInFlight({
    offensiveTeam,
    fieldPos,
}: {
    offensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
}) {
    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();

    $dispose(() => {
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
    });

    function buildFrame(state: GameState): Frame {
        const offensivePlayers = state.players.filter(
            (player) => player.team === offensiveTeam,
        );
        const defensivePlayers = state.players.filter(
            (player) => player.team !== offensiveTeam,
        );
        const offensiveCatcher = findTouchdownAwareBallCatcher(
            state.ball,
            offensivePlayers,
            offensiveTeam,
        );
        const isTouchdownCatch =
            offensiveCatcher !== null &&
            isTouchdown({ player: offensiveCatcher, offensiveTeam });

        return {
            state,
            outOfBoundsCatcher: isTouchdownCatch
                ? null
                : findOutOfBoundsBallCatcher(
                      state.ball,
                      offensivePlayers.filter(
                          (player) => player.id !== offensiveCatcher?.id,
                      ),
                  ),
            offensiveCatcher,
            defensiveCatcher: findEligibleBallCatcher(
                state.ball,
                defensivePlayers,
            ),
            defensiveOutOfBoundsCatcher: findOutOfBoundsBallCatcher(
                state.ball,
                defensivePlayers,
            ),
        };
    }

    function $handleOutOfBoundsReception(frame: Frame) {
        if (isBallOutOfBounds(frame.state.ball)) return;
        if (!frame.outOfBoundsCatcher) return;

        $effect(($) => {
            $.send({
                message: cn(
                    t`❌ Out-of-bounds reception by ${frame.outOfBoundsCatcher!.name}`,
                    t`two-point try failed.`,
                ),
                color: COLOR.WARNING,
            });
        });

        $next({
            to: "KICKOFF",
            params: { forTeam: offensiveTeam },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $handleBallOutOfBounds(frame: Frame) {
        if (!isBallOutOfBounds(frame.state.ball)) return;

        $effect(($) => {
            $.send({
                message: t`❌ Two-point try failed.`,
                color: COLOR.WARNING,
            });
        });

        $next({
            to: "KICKOFF",
            params: { forTeam: offensiveTeam },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $handleOffensiveReception(frame: Frame) {
        if (!frame.offensiveCatcher) return;
        const catcher = frame.offensiveCatcher;

        $effect(($) => {
            $.send({
                message: t`🏈 Two-point pass complete to ${catcher.name}!`,
                color: COLOR.MOMENTUM,
            });
        });

        $next({
            to: "EXTRA_POINT_RUN",
            params: {
                playerId: catcher.id,
                ballTeam: offensiveTeam,
                originalOffensiveTeam: offensiveTeam,
                fieldPos,
            },
        });
    }

    function $handleDefensiveCatch(frame: Frame) {
        if (!frame.defensiveCatcher) return;

        $next({
            to: "EXTRA_POINT_PASS_DEFLECTION",
            params: {
                blockTime: frame.state.tickNumber,
                blockerId: frame.defensiveCatcher.id,
                isKickingBall: frame.defensiveCatcher.isKickingBall,
                offensiveTeam,
                fieldPos,
            },
        });
    }

    function $handleDefensiveOutOfBoundsCatch(frame: Frame) {
        if (!frame.defensiveOutOfBoundsCatcher) return;

        $next({
            to: "EXTRA_POINT_PASS_DEFLECTION",
            params: {
                blockTime: frame.state.tickNumber,
                blockerId: frame.defensiveOutOfBoundsCatcher.id,
                isKickingBall: frame.defensiveOutOfBoundsCatcher.isKickingBall,
                offensiveTeam,
                fieldPos,
            },
        });
    }

    function $handleBallLeftTwoPointZone(frame: Frame) {
        if (isInExtraPointZone(frame.state.ball, offensiveTeam)) return;

        $effect(($) => {
            $.send({
                message: t`❌ Two-point try failed.`,
                color: COLOR.WARNING,
            });
        });

        $next({
            to: "KICKOFF",
            params: { forTeam: offensiveTeam },
            wait: ticks({ seconds: 2 }),
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

        $handleDefensiveOutOfBoundsCatch(frame);
        $handleBallOutOfBounds(frame);
        $handleOutOfBoundsReception(frame);
        $handleOffensiveReception(frame);
        $handleDefensiveCatch(frame);
        $handleBallLeftTwoPointZone(frame);
    }

    return { run, command };
}
