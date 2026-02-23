import { $dispose, $effect, $next } from "@runtime/hooks";
import type { FieldTeam } from "@runtime/models";
import { ticks } from "@common/general/time";
import { AVATARS, opposite } from "@common/game/game";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/shared/message";
import {
    getFieldPosition,
    intersectsEndZone,
    isBallOutOfBounds,
    TOUCHBACK_YARD_LINE,
} from "@meta/legacy/shared/stadium";
import { getInitialDownState } from "@meta/legacy/shared/down";
import { $setBallMoveableByPlayer } from "@meta/legacy/hooks/physics";
import { $setBallActive, $setBallInactive } from "@meta/legacy/hooks/game";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
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
    kickingTeamCatcher: GameStatePlayer | null;
};

export function PuntInFlight({ kickingTeam }: { kickingTeam: FieldTeam }) {
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

        if (intersectsEndZone(frame.state.ball, receivingTeam)) {
            $effect(($) => {
                $.send({
                    message: cn(
                        t`🚪 Out-of-bounds reception by ${frame.outOfBoundsCatcher!.name}`,
                        t`touchback.`,
                    ),
                    color: COLOR.ALERT,
                });
            });

            $next({
                to: "PRESNAP",
                params: {
                    downState: getInitialDownState(receivingTeam, {
                        yards: TOUCHBACK_YARD_LINE,
                        side: receivingTeam,
                    }),
                },
                wait: ticks({ seconds: 2 }),
            });
        }

        const fieldPos = getFieldPosition(frame.state.ball.x);

        $effect(($) => {
            $.send({
                message: cn(
                    t`🚪 Out-of-bounds reception by ${frame.outOfBoundsCatcher!.name}`,
                    t`ball spotted at the ${fieldPos.yards}-yard line.`,
                ),
                color: COLOR.WARNING,
            });
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: getInitialDownState(receivingTeam, fieldPos),
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

        if (intersectsEndZone(frame.state.ball, receivingTeam)) {
            $effect(($) => {
                $.send({
                    message: cn(t`Punt out in the end zone`, t`touchback.`),
                    color: COLOR.ALERT,
                });
            });

            $next({
                to: "PRESNAP",
                params: {
                    downState: getInitialDownState(receivingTeam, {
                        yards: TOUCHBACK_YARD_LINE,
                        side: receivingTeam,
                    }),
                },
                wait: ticks({ seconds: 2 }),
            });
        }

        const fieldPos = getFieldPosition(frame.state.ball.x);

        $effect(($) => {
            $.send({
                message: cn(
                    t`🚪 Punt out of bounds`,
                    t`ball spotted at the ${fieldPos.yards}-yard line.`,
                ),
                color: COLOR.WARNING,
            });
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: getInitialDownState(receivingTeam, fieldPos),
            },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $handlePuntReturn(frame: Frame) {
        if (!frame.receivingCatcher) return;
        const catcher = frame.receivingCatcher;

        $effect(($) => {
            $.send({
                message: t`🏈 Punt return by ${catcher.name}!`,
                color: COLOR.MOMENTUM,
            });
        });

        $next({
            to: "PUNT_RETURN",
            params: { playerId: catcher.id, receivingTeam },
        });
    }

    function $handleIllegalTouch(frame: Frame) {
        if (!frame.kickingTeamCatcher) return;
        const catcher = frame.kickingTeamCatcher;

        $effect(($) => {
            $.send({
                message: cn(
                    t`❌ Illegal touch`,
                    t`punt caught first by the kicking team (${catcher.name}).`,
                ),
                color: COLOR.WARNING,
            });
            $.setAvatar(catcher.id, AVATARS.CANCEL);
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
                info: { stateMessage: t`Punt in flight` },
            },
            player,
            spec,
        });
    }

    function run(state: GameState) {
        const frame = buildFrame(state);

        $handleBallOutOfBounds(frame);
        $handleOutOfBoundsReception(frame);
        $handlePuntReturn(frame);
        $handleIllegalTouch(frame);
    }

    return { run, join, command };
}
