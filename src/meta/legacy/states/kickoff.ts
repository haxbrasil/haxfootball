import { $checkpoint, $dispose, $effect, $next } from "@runtime/hooks";
import { Team, type FieldTeam } from "@runtime/models";
import { distributeOnLine, getMidpoint } from "@common/math/geometry";
import { opposite } from "@common/game/game";
import { t } from "@lingui/core/macro";
import {
    $trapTeamInMidField,
    $trapTeamInEndZone,
    $untrapAllTeams,
    $setBallKickForce,
    $setBallMoveable,
    $setBallUnmoveable,
    $trapPlayerInMidField,
    $trapPlayerInEndZone,
    $setBallInMiddleOfField,
    $setBallUnmoveableByPlayer,
} from "@meta/legacy/hooks/physics";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import type { CommandSpec } from "@core/commands";
import {
    $global,
    $syncPossessionQuarterbackSelection,
} from "@meta/legacy/hooks/global";

const KICKOFF_START_LINE = {
    [Team.RED]: {
        start: { x: -150, y: -150 },
        end: { x: -150, y: 150 },
    },
    [Team.BLUE]: {
        start: { x: 150, y: -150 },
        end: { x: 150, y: 150 },
    },
};

export function Kickoff({ forTeam = Team.RED }: { forTeam?: FieldTeam }) {
    const receivingTeam = opposite(forTeam);

    $global((state) => state.clearPossessionQuarterback());

    $setBallInMiddleOfField();
    $trapTeamInMidField(forTeam);
    $trapTeamInEndZone(opposite(forTeam));
    $setBallKickForce("strong");
    $setBallUnmoveable();

    $effect(($) => {
        const players = $.getPlayerList()
            .filter((p) => p.team === forTeam)
            .map((p) => ({ ...p.position, id: p.id }));

        distributeOnLine(players, KICKOFF_START_LINE[forTeam]).forEach(
            ({ id, x, y }) => {
                $.setPlayerDiscProperties(id, {
                    x,
                    y,
                });
            },
        );
    });

    $dispose(() => {
        $untrapAllTeams();
        $setBallMoveable();
        $setBallKickForce("normal");
    });

    $checkpoint({
        to: "KICKOFF",
        params: { forTeam },
    });

    function join(player: GameStatePlayer) {
        if (player.team === forTeam) {
            $effect(($) => {
                const midpoint = getMidpoint(
                    KICKOFF_START_LINE[forTeam].start,
                    KICKOFF_START_LINE[forTeam].end,
                );

                $.setPlayerDiscProperties(player.id, {
                    x: midpoint.x,
                    y: midpoint.y,
                });
            });

            $trapPlayerInMidField(player.id);
            $setBallUnmoveableByPlayer(player.id);
        } else {
            $trapPlayerInEndZone(player.id);
            $setBallUnmoveableByPlayer(player.id);
        }
    }

    function command(player: PlayerObject, spec: CommandSpec) {
        return $createSharedCommandHandler({
            options: {
                undo: true,
                info: { stateMessage: t`Kickoff` },
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

        const kicker = state.players.find((p) => p.isKickingBall);

        if (kicker) {
            $next({
                to: "KICKOFF_IN_FLIGHT",
                params: { kickingTeam: forTeam },
            });
        }
    }

    return { join, run, command };
}
