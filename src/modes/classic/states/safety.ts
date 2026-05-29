import { Team, type FieldTeam } from "@runtime/models";
import type { GameState } from "@runtime/engine";
import { distributeOnLine } from "@common/math/geometry";
import { FieldPosition, opposite } from "@common/game/game";
import { ticks } from "@common/general/time";
import {
    $setBallKickForce,
    $setBallMoveable,
    $setBallUnmoveable,
    $lockBall,
    $unlockBall,
    $trapTeamInEndZone,
    $untrapAllTeams,
} from "@modes/classic/hooks/physics";
import { $dispose, $effect } from "@runtime/hooks";
import {
    calculateDirectionalGain,
    getPositionFromFieldPosition,
} from "@modes/classic/shared/stadium";
import { $config, $next, $tick } from "@runtime/runtime";
import { t } from "@lingui/core/macro";
import { $createSharedCommandHandler } from "@modes/classic/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";
import type { Config } from "@modes/classic/config";
import { getInitialDownState } from "@modes/classic/shared/down";
import { cn } from "@modes/classic/shared/message";
import { SAFETY_KICK_TIMEOUT_TICKS } from "@modes/classic/shared/timeouts";
import { $setBallActive, $setBallInactive } from "@modes/classic/hooks/game";

const KICKING_TEAM_POSITIONS_OFFSET = {
    start: { x: -50, y: -150 },
    end: { x: -50, y: 150 },
};

const YARD_LINE_FOR_SAFETY = 25;

export function Safety({ kickingTeam }: { kickingTeam: FieldTeam }) {
    const config = $config<Config>();

    $trapTeamInEndZone(opposite(kickingTeam));
    $setBallKickForce("strong");
    $setBallUnmoveable();

    const safetyFieldPos: FieldPosition = {
        yards: YARD_LINE_FOR_SAFETY,
        side: kickingTeam,
    };

    const ballPos = {
        x: getPositionFromFieldPosition(safetyFieldPos),
        y: 0,
    };

    $effect(($) => {
        $.setBall({ ...ballPos, xspeed: 0, yspeed: 0 });
    });

    $effect(($) => {
        const kickingTeamPlayers = $.getPlayerList()
            .filter((p) => p.team === kickingTeam)
            .sort((a, b) => a.position.y - b.position.y)
            .map((p) => ({ ...p.position, id: p.id }));

        distributeOnLine(kickingTeamPlayers, {
            start: {
                x:
                    ballPos.x +
                    KICKING_TEAM_POSITIONS_OFFSET.start.x *
                        (kickingTeam === Team.RED ? 1 : -1),
                y: KICKING_TEAM_POSITIONS_OFFSET.start.y,
            },
            end: {
                x:
                    ballPos.x +
                    KICKING_TEAM_POSITIONS_OFFSET.end.x *
                        (kickingTeam === Team.RED ? 1 : -1),
                y: KICKING_TEAM_POSITIONS_OFFSET.end.y,
            },
        }).forEach(({ id, x, y }) => {
            $.setPlayerDiscProperties(id, { x, y });
        });
    });

    $dispose(() => {
        $untrapAllTeams();
        $setBallMoveable();
        $unlockBall();
        $setBallKickForce("normal");
    });

    const getPlayersBeyondBallLine = (state: GameState) =>
        state.players.filter(
            (player) =>
                player.team === kickingTeam &&
                calculateDirectionalGain(kickingTeam, player.x - state.ball.x) >
                    0,
        );

    function command(player: PlayerObject, spec: CommandSpec) {
        return $createSharedCommandHandler({
            options: {
                undo: true,
                info: { stateMessage: t`Safety` },
            },
            player,
            spec,
        });
    }

    function $handleSafetyKickTimeout() {
        if (!config.flags.timeouts) return;

        const { current: elapsedTicks } = $tick();
        if (elapsedTicks < SAFETY_KICK_TIMEOUT_TICKS) return;

        const receivingTeam = opposite(kickingTeam);
        const nextDownState = getInitialDownState(
            receivingTeam,
            safetyFieldPos,
        );

        $setBallInactive();

        $dispose(() => {
            $setBallActive();
        });

        $effect(($) => {
            $.send({
                message: cn(
                    "⏱️",
                    nextDownState,
                    t`safety-kick clock expired`,
                    t`kicking team loses possession.`,
                ),
                color: COLOR.ALERT,
            });
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: nextDownState,
            },
            wait: ticks({ seconds: 1 }),
        });
    }

    function run(state: GameState) {
        $handleSafetyKickTimeout();

        const playersPastBall = getPlayersBeyondBallLine(state);
        const hasPlayersPastBall = playersPastBall.length > 0;

        if (hasPlayersPastBall) {
            $lockBall();
        } else {
            $unlockBall();
            $setBallKickForce("strong");
        }

        const kicker = state.players.find(
            (player) => player.isKickingBall && player.team === kickingTeam,
        );

        if (!kicker) return;

        if (hasPlayersPastBall) {
            $effect(($) => {
                $.send({
                    message: t`⚠️ You cannot kick while a teammate is past the ball line.`,
                    to: kicker.id,
                    color: COLOR.CRITICAL,
                });
            });

            return;
        }

        $next({
            to: "SAFETY_KICK_IN_FLIGHT",
            params: {
                kickingTeam,
            },
        });
    }

    return { run, command };
}
