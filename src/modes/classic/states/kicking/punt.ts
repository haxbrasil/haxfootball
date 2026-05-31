import type { GameState } from "@runtime/engine";
import { Team, type FieldTeam } from "@runtime/models";
import { distributeOnLine } from "@common/math/geometry";
import { opposite } from "@common/game/game";
import { ticks } from "@common/general/time";
import { t } from "@lingui/core/macro";
import { $dispose, $effect } from "@runtime/hooks";
import { $config, $next, $tick } from "@runtime/runtime";
import {
    $lockBall,
    $setBallKickForce,
    $setBallMoveable,
    $setBallUnmoveable,
    $trapTeamInEndZone,
    $untrapAllTeams,
    $unlockBall,
} from "@modes/classic/hooks/physics";
import {
    DownState,
    getInitialDownState,
} from "@modes/classic/shared/rules/down";
import { $createSharedCommandHandler } from "@modes/classic/shared/commands";
import {
    calculateDirectionalGain,
    getPositionFromFieldPosition,
} from "@modes/classic/shared/field";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";
import type { Config } from "@modes/classic/config";
import { cn } from "@modes/classic/shared/presentation/message";
import { PUNT_KICK_TIMEOUT_TICKS } from "@modes/classic/shared/rules/punt";
import { $setBallActive, $setBallInactive } from "@modes/classic/hooks/game";

const KICKING_TEAM_POSITIONS_OFFSET = {
    start: { x: -50, y: -150 },
    end: { x: -50, y: 150 },
};

export function Punt({ downState }: { downState: DownState }) {
    const { offensiveTeam, fieldPos } = downState;
    const kickingTeam: FieldTeam = offensiveTeam;
    const config = $config<Config>();

    $trapTeamInEndZone(opposite(kickingTeam));
    $setBallKickForce("strong");
    $setBallUnmoveable();

    const ballPos = {
        x: getPositionFromFieldPosition(fieldPos),
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
                info: { downState },
            },
            player,
            spec,
        });
    }

    function $handlePuntKickTimeout() {
        if (!config.flags.timeouts) return;

        const { current: elapsedTicks } = $tick();
        if (elapsedTicks < PUNT_KICK_TIMEOUT_TICKS) return;

        const receivingTeam = opposite(kickingTeam);
        const nextDownState = getInitialDownState(receivingTeam, fieldPos);

        $setBallInactive();

        $dispose(() => {
            $setBallActive();
        });

        $effect(($) => {
            $.send({
                message: cn(
                    "⏱️",
                    nextDownState,
                    t`punt clock expired`,
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
        $handlePuntKickTimeout();

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

                $.send({
                    message: t`⚠️ You must get back behind the ball line to allow the punt!`,
                    to: playersPastBall,
                    sound: "notification",
                    color: COLOR.CRITICAL,
                });
            });

            return;
        }

        $next({
            to: "PUNT_IN_FLIGHT",
            params: { kickingTeam },
        });
    }

    return { run, command };
}
