import { $dispose, $effect, $next } from "@runtime/hooks";
import { type FieldTeam } from "@runtime/models";
import { ticks } from "@common/general/time";
import { opposite } from "@common/game/game";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/shared/message";
import {
    isBallOutOfBounds,
    KICKOFF_OUT_OF_BOUNDS_YARD_LINE,
} from "@meta/legacy/shared/stadium";
import { getInitialDownState } from "@meta/legacy/shared/down";
import { $setBallMoveableByPlayer } from "@meta/legacy/hooks/physics";
import { $setBallActive, $setBallInactive } from "@meta/legacy/hooks/game";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import { $syncPossessionQuarterbackSelection } from "@meta/legacy/hooks/global";
import {
    findEligibleBallCatcher,
    findOutOfBoundsBallCatcher,
} from "@meta/legacy/shared/reception";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";

type Frame = {
    state: GameState;
    outOfBoundsCatcher: GameStatePlayer | null;
    receivingCatcher: GameStatePlayer | null;
};

export function KickoffInFlight({ kickingTeam }: { kickingTeam: FieldTeam }) {
    const receivingTeam = opposite(kickingTeam);

    function buildFrame(state: GameState): Frame {
        return {
            state,
            outOfBoundsCatcher: findOutOfBoundsBallCatcher(
                state.ball,
                state.players,
            ),
            receivingCatcher: findEligibleBallCatcher(
                state.ball,
                state.players.filter((player) => player.team === receivingTeam),
            ),
        };
    }

    function $handleOutOfBoundsReception(frame: Frame) {
        if (isBallOutOfBounds(frame.state.ball)) return;
        if (!frame.outOfBoundsCatcher) return;

        $setBallInactive();

        $dispose(() => {
            $setBallActive();
        });

        $effect(($) => {
            $.send({
                message: cn(
                    t`❌ Out-of-bounds reception by ${frame.outOfBoundsCatcher!.name}`,
                    t`ball spotted at the ${KICKOFF_OUT_OF_BOUNDS_YARD_LINE}-yard line.`,
                ),
                color: COLOR.WARNING,
            });
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: getInitialDownState(receivingTeam, {
                    yards: KICKOFF_OUT_OF_BOUNDS_YARD_LINE,
                    side: receivingTeam,
                }),
            },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $handleBallOutOfBounds(frame: Frame) {
        if (!isBallOutOfBounds(frame.state.ball)) return;

        $setBallInactive();

        $dispose(() => {
            $setBallActive();
        });

        $effect(($) => {
            $.send({
                message: cn(
                    t`❌ Kickoff out of bounds`,
                    t`ball spotted at the ${KICKOFF_OUT_OF_BOUNDS_YARD_LINE}-yard line.`,
                ),
                color: COLOR.WARNING,
            });
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: getInitialDownState(receivingTeam, {
                    yards: KICKOFF_OUT_OF_BOUNDS_YARD_LINE,
                    side: receivingTeam,
                }),
            },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $handleKickoffReturn(frame: Frame) {
        if (!frame.receivingCatcher) return;
        const catcher = frame.receivingCatcher;

        $effect(($) => {
            $.send({
                message: t`🏈 Kickoff return by ${catcher.name}!`,
                color: COLOR.MOMENTUM,
            });
        });

        $next({
            to: "KICKOFF_RETURN",
            params: {
                playerId: catcher.id,
                receivingTeam,
            },
        });
    }

    function join(player: GameStatePlayer) {
        $setBallMoveableByPlayer(player.id);
    }

    function command(player: PlayerObject, spec: CommandSpec) {
        return $createSharedCommandHandler({
            options: {
                undo: true,
                info: { stateMessage: t`Kickoff in flight` },
                qb: { eligibleTeam: receivingTeam },
            },
            player,
            spec,
        });
    }

    function run(state: GameState) {
        $syncPossessionQuarterbackSelection({
            team: receivingTeam,
            players: state.players,
        });

        const frame = buildFrame(state);

        $handleBallOutOfBounds(frame);
        $handleOutOfBoundsReception(frame);
        $handleKickoffReturn(frame);
    }

    return { run, join, command };
}
