import { Team, type FieldTeam } from "@runtime/models";
import type { GameState } from "@runtime/engine";
import { distributeOnLine } from "@common/math/geometry";
import { FieldPosition, opposite } from "@common/game/game";
import {
    $setBallKickForce,
    $setBallMoveable,
    $setBallUnmoveable,
    $lockBall,
    $unlockBall,
    $trapTeamInEndZone,
    $untrapAllTeams,
} from "@meta/legacy/hooks/physics";
import { $dispose, $effect } from "@runtime/hooks";
import {
    calculateDirectionalGain,
    getPositionFromFieldPosition,
} from "@meta/legacy/shared/stadium";
import { $next } from "@runtime/runtime";
import { t } from "@lingui/core/macro";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";

const KICKING_TEAM_POSITIONS_OFFSET = {
    start: { x: -50, y: -150 },
    end: { x: -50, y: 150 },
};

const YARD_LINE_FOR_SAFETY = 25;

export function Safety({ kickingTeam }: { kickingTeam: FieldTeam }) {
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

    function run(state: GameState) {
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
            params: { kickingTeam },
        });
    }

    return { run, command };
}
