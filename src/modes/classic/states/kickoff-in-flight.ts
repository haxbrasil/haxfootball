import { $dispose, $effect, $next } from "@runtime/hooks";
import { type FieldTeam } from "@runtime/models";
import { ticks } from "@common/general/time";
import { AVATARS, opposite } from "@common/game/game";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { t } from "@lingui/core/macro";
import { cn } from "@modes/classic/shared/message";
import {
    getFieldPosition,
    isBallOutOfBounds,
    KICKOFF_OUT_OF_BOUNDS_YARD_LINE,
} from "@modes/classic/shared/stadium";
import { getInitialDownState } from "@modes/classic/shared/down";
import { $setBallMoveableByPlayer } from "@modes/classic/hooks/physics";
import { $setBallActive, $setBallInactive } from "@modes/classic/hooks/game";
import { $createSharedCommandHandler } from "@modes/classic/shared/commands";
import { $syncPossessionQuarterbackSelection } from "@modes/classic/hooks/global";
import {
    findEligibleBallCatcher,
    findOutOfBoundsBallCatcher,
} from "@modes/classic/shared/reception";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";

type Frame = {
    state: GameState;
    outOfBoundsCatcher: GameStatePlayer | null;
    receivingCatcher: GameStatePlayer | null;
    kickingTeamCatcher: GameStatePlayer | null;
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
            kickingTeamCatcher: findEligibleBallCatcher(
                state.ball,
                state.players.filter((player) => player.team === kickingTeam),
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
                startFieldPosition: getFieldPosition(catcher.x),
            },
        });
    }

    function $handleIllegalTouch(frame: Frame) {
        if (!frame.kickingTeamCatcher) return;
        const catcher = frame.kickingTeamCatcher;

        $effect(($) => {
            $.send({
                message: cn(
                    t`❌ Illegal touch`,
                    t`kickoff touched first by ${catcher.name} from the kicking team.`,
                ),
                color: COLOR.WARNING,
            });
            $.setAvatar(catcher.id, AVATARS.CANCEL);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(catcher.id, null);
            });
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: getInitialDownState(
                    receivingTeam,
                    getFieldPosition(catcher.x),
                    catcher.y,
                ),
            },
            wait: ticks({ seconds: 2 }),
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
        $handleIllegalTouch(frame);
    }

    return { run, join, command };
}
