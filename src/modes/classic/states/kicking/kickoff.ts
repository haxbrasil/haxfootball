import { $checkpoint, $config, $dispose, $effect, $next } from "@runtime/hooks";
import { Team, type FieldTeam } from "@runtime/models";
import { distributeOnLine, getMidpoint } from "@common/math/geometry";
import { opposite } from "@common/game/game";
import { ticks } from "@common/general/time";
import { t } from "@lingui/core/macro";
import {
    $trapTeamInMidField,
    $trapTeamInEndZone,
    $untrapAllTeams,
    $setBallKickForce,
    $lockBall,
    $setBallMoveable,
    $setBallUnmoveable,
    $trapPlayerInMidField,
    $trapPlayerInEndZone,
    $setBallInMiddleOfField,
    $setBallUnmoveableByPlayer,
} from "@modes/classic/hooks/physics";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { $createSharedCommandHandler } from "@modes/classic/shared/commands";
import type { CommandSpec } from "@core/commands";
import {
    $global,
    $syncPossessionQuarterbackSelection,
} from "@modes/classic/hooks/global";
import { $tick } from "@runtime/runtime";
import type { Config } from "@modes/classic/config";
import { getInitialDownState } from "@modes/classic/shared/rules/down";
import { KICKOFF_OUT_OF_BOUNDS_YARD_LINE } from "@modes/classic/shared/field";
import { COLOR } from "@common/general/color";
import { cn, formatTeamName } from "@modes/classic/shared/presentation/message";
import { $setBallActive, $setBallInactive } from "@modes/classic/hooks/game";
import {
    KICKOFF_KICK_TIMEOUT_SECONDS,
    KICKOFF_KICK_TIMEOUT_TICKS,
    KICKOFF_WARNING_SECONDS_REMAINING,
    KICKOFF_WARNING_TICKS,
} from "@modes/classic/shared/rules/kickoff";
import type { GameStateInspection } from "@runtime/inspection";

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
    const config = $config<Config>();
    const kickingTeamName = formatTeamName(forTeam);

    $global((state) => state.clearPossessionQuarterback());

    $setBallInMiddleOfField();
    $trapTeamInMidField(forTeam);
    $trapTeamInEndZone(opposite(forTeam));
    $setBallKickForce("strong");
    $setBallUnmoveable();

    $effect(($) => {
        const players = $.getPlayerList().flatMap((player) => {
            if (player.team !== forTeam || !player.position) {
                return [];
            }

            return [{ ...player.position, id: player.id }];
        });

        distributeOnLine(players, KICKOFF_START_LINE[forTeam]).forEach(
            ({ id, x, y }) => {
                $.setPlayerDiscProperties(id, {
                    x,
                    y,
                });
            },
        );
    });

    $effect(($) => {
        if (config.flags.timeouts) {
            const players = $.getPlayerList();
            const kickingTeamPlayers = players.filter(
                (player) => player.team === forTeam,
            );
            const otherPlayers = players.filter(
                (player) => player.team !== forTeam,
            );

            $.send({
                message: t`🏈 Kickoff for ${kickingTeamName}. Kick within ${KICKOFF_KICK_TIMEOUT_SECONDS}s.`,
                to: kickingTeamPlayers,
                color: COLOR.ACTION,
            });
            $.send({
                message: t`🏈 Kickoff for ${kickingTeamName}.`,
                to: otherPlayers,
                color: COLOR.ACTION,
            });
            return;
        }

        $.send({
            message: t`🏈 Kickoff for ${kickingTeamName}.`,
            color: COLOR.ACTION,
        });
    });

    $dispose(() => {
        $untrapAllTeams();
        $setBallMoveable();
        $setBallKickForce("normal");
        $setBallActive();
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

    function $handleKickoffTimeout() {
        if (!config.flags.timeouts) return;

        const { current: elapsedTicks } = $tick();

        if (elapsedTicks === KICKOFF_WARNING_TICKS) {
            $effect(($) => {
                $.pauseGame(true);
                $.pauseGame(false);
                $.send({
                    message: t`⏱️ ${KICKOFF_WARNING_SECONDS_REMAINING}s left to kick off.`,
                    to: $.getPlayerList().filter(
                        (player) => player.team === forTeam,
                    ),
                    color: COLOR.ALERT,
                    sound: "notification",
                });
            });
        }

        if (elapsedTicks < KICKOFF_KICK_TIMEOUT_TICKS) return;

        const nextDownState = getInitialDownState(receivingTeam, {
            side: receivingTeam,
            yards: KICKOFF_OUT_OF_BOUNDS_YARD_LINE,
        });

        $setBallInactive();

        $dispose(() => {
            $setBallUnmoveable();
            $lockBall();
            $setBallInactive();
        });

        $effect(($) => {
            $.send({
                message: cn(
                    "⏱️",
                    nextDownState,
                    t`kickoff clock expired`,
                    t`receiving team gets the ball at the ${KICKOFF_OUT_OF_BOUNDS_YARD_LINE}-yard line.`,
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
            disposal: "IMMEDIATE",
        });
    }

    function run(state: GameState) {
        $handleKickoffTimeout();

        $syncPossessionQuarterbackSelection({
            team: receivingTeam,
            players: state.players,
        });

        const kicker = state.players.find(
            (p) => p.team === forTeam && p.isKickingBall,
        );

        if (kicker) {
            $next({
                to: "KICKOFF_IN_FLIGHT",
                params: {
                    kickingTeam: forTeam,
                },
            });
        }
    }

    function inspect(): GameStateInspection {
        return { continuity: "before-play-start" };
    }

    return { join, run, command, inspect };
}
