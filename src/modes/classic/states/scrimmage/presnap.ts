import { type FieldTeam, isFieldTeam, Team } from "@runtime/models";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { CommandHandleResult, CommandSpec } from "@core/commands";
import { opposite } from "@common/game/game";
import { parseIntegerInRange, parseTeamSide } from "@common/game/parsing";
import { ticks } from "@common/general/time";
import {
    BALL_OFFSET_YARDS,
    calculateDirectionalGain,
    calculateSnapBallPosition,
    isInRedZone,
} from "@modes/classic/shared/field";
import {
    $before,
    $checkpoint,
    $config,
    $dispose,
    $effect,
    $isGamePaused,
    $next,
    $tick,
} from "@runtime/runtime";
import {
    $lockBall,
    $setBallMoveable,
    $setBallUnmoveable,
    $unlockBall,
} from "@modes/classic/hooks/physics";
import { t } from "@lingui/core/macro";
import { cn } from "@modes/classic/shared/presentation/message";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@modes/classic/hooks/game";
import {
    DownState,
    incrementDownState,
    MAX_DOWNS,
    processDownEventIncrement,
    withLastBallYAtCenter,
} from "@modes/classic/shared/rules/down";
import assert from "node:assert";
import {
    $global,
    $syncPossessionQuarterbackSelection,
} from "@modes/classic/hooks/global";
import {
    buildInitialPlayerPositions,
    DEFAULT_INITIAL_POSITIONING_RELATIVE_LINES,
} from "@modes/classic/shared/formation/initial-positioning";
import { $createSharedCommandHandler } from "@modes/classic/shared/commands";
import { CLASSIC_COMMAND } from "@modes/classic/shared/commands/names";
import { COLOR } from "@common/general/color";
import { type Config } from "@modes/classic/config";
import { $syncLineOfScrimmageBlocking } from "@modes/classic/hooks/los";
import { BLITZ_BASE_DELAY_IN_SECONDS } from "@modes/classic/shared/rules/blitz";
import {
    isTooFarFromBall,
    MIN_SNAP_DELAY_TICKS,
} from "@modes/classic/shared/rules/snap";
import { PUNT_KICK_TIMEOUT_SECONDS } from "@modes/classic/shared/rules/punt";
import {
    HIKE_TIMEOUT_SECONDS,
    HIKE_TIMEOUT_TICKS,
    HIKE_WARNING_SECONDS_REMAINING,
    HIKE_WARNING_TICKS,
} from "@modes/classic/shared/rules/snap";
import type { GameStateInspection } from "@runtime/inspection";

const MIN_DISTANCE = 1;
const MAX_DISTANCE_CMD = 20;
const MIN_DOWN = 1;
const MAX_LOS_YARDS = 50;

function $setInitialPlayerPositions({
    offensiveTeam,
    ballPos,
    targetPlayerId,
    quarterbackId,
}: {
    offensiveTeam: FieldTeam;
    ballPos: Position;
    targetPlayerId?: number;
    quarterbackId?: number;
}) {
    const snapProfile = $global().snapProfile;

    $effect(($) => {
        const players = $.getPlayerList().flatMap((player) => {
            if (!isFieldTeam(player.team)) {
                return [];
            }

            return [
                {
                    id: player.id,
                    team: player.team,
                    position: {
                        x: player.position.x,
                        y: player.position.y,
                    },
                },
            ];
        });

        const initialPlayerPositions = buildInitialPlayerPositions({
            players,
            offensiveTeam,
            ballPos,
            relativeLines: DEFAULT_INITIAL_POSITIONING_RELATIVE_LINES,
            snapProfile,
            ...(quarterbackId !== undefined
                ? { offensiveAnchorPlayerId: quarterbackId }
                : {}),
        });

        const playerPositions = targetPlayerId
            ? initialPlayerPositions.filter(({ id }) => id === targetPlayerId)
            : initialPlayerPositions;

        playerPositions.forEach(({ id, x, y }) => {
            $.setPlayerDiscProperties(id, {
                x,
                y,
                xspeed: 0,
                yspeed: 0,
            });
        });
    });
}

export function Presnap({ downState }: { downState: DownState }) {
    const { offensiveTeam, downAndDistance, fieldPos } = downState;

    const initialState = $before();
    const initialPlayersSnapshot = initialState.players;
    const config = $config<Config>();
    const requireQb = config.flags.requireQb;

    assert(
        downAndDistance.down >= 1 &&
            downAndDistance.down <= MAX_DOWNS &&
            downAndDistance.distance >= 0,
        "Invalid down and distance",
    );

    const ballPosWithOffset = calculateSnapBallPosition(
        offensiveTeam,
        fieldPos,
        BALL_OFFSET_YARDS,
    );

    const ballPos = calculateSnapBallPosition(offensiveTeam, fieldPos);

    $setBallUnmoveable();
    $lockBall();
    $setBallActive();
    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);

    $effect(($) => {
        $.setBall({ ...ballPosWithOffset, xspeed: 0, yspeed: 0 });
    });

    const initialQuarterbackId = requireQb
        ? $syncPossessionQuarterbackSelection({
              team: offensiveTeam,
              players: initialPlayersSnapshot,
          })
        : null;

    if (requireQb && initialQuarterbackId === null) {
        $effect(($) => {
            $.send({
                message: config.flags.timeouts
                    ? t`⚠️ No quarterback selected. Use !qb to become QB before the ${HIKE_TIMEOUT_SECONDS}s hike clock expires.`
                    : t`⚠️ Quarterback position is vacant. Use !qb to become the quarterback.`,
                to: initialPlayersSnapshot.filter(
                    (player) => player.team === offensiveTeam,
                ),
                color: COLOR.WARNING,
            });
        });
    }

    if (requireQb && initialQuarterbackId !== null && config.flags.timeouts) {
        $effect(($) => {
            $.send({
                message: t`⏱️ Hike within ${HIKE_TIMEOUT_SECONDS}s.`,
                to: initialQuarterbackId,
                color: COLOR.WARNING,
            });
        });
    }

    $setInitialPlayerPositions({
        offensiveTeam,
        ballPos,
        ...(initialQuarterbackId !== null
            ? { quarterbackId: initialQuarterbackId }
            : {}),
    });

    $dispose(() => {
        $setBallMoveable();
        $unlockBall();
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();

        if (config.flags.losBlocking) {
            $syncLineOfScrimmageBlocking({ enabled: false });
        }
    });

    $checkpoint({
        to: "PRESNAP",
        params: { downState },
    });

    function getOffensivePlayersBeyondLineOfScrimmage(): GameStatePlayer[] {
        const state = $before();

        return state.players.filter(
            (statePlayer) =>
                statePlayer.team === offensiveTeam &&
                calculateDirectionalGain(
                    offensiveTeam,
                    statePlayer.x - ballPos.x,
                ) > 0,
        );
    }

    function join(player: GameStatePlayer) {
        const state = $before();
        const selectedQuarterbackId = requireQb
            ? $syncPossessionQuarterbackSelection({
                  team: offensiveTeam,
                  players: state.players,
              })
            : null;

        $setInitialPlayerPositions({
            offensiveTeam,
            ballPos,
            targetPlayerId: player.id,
            ...(selectedQuarterbackId !== null
                ? { quarterbackId: selectedQuarterbackId }
                : {}),
        });
    }

    function chat(player: PlayerObject, message: string): false | void {
        const normalizedMessage = message.trim().toLowerCase();
        const isHikeCommand = normalizedMessage === "hike";

        if (isHikeCommand) {
            if ($isGamePaused()) {
                return false;
            }

            if (player.team !== offensiveTeam) {
                return;
            }

            if (requireQb) {
                const { possessionQuarterback } = $global();

                if (
                    possessionQuarterback &&
                    possessionQuarterback.team !== offensiveTeam
                ) {
                    $global((state) => state.clearPossessionQuarterback());
                }

                const selectedQuarterbackId =
                    possessionQuarterback?.team === offensiveTeam
                        ? possessionQuarterback.playerId
                        : null;

                if (selectedQuarterbackId === null) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ Select a quarterback with !qb before snapping.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return false;
                }

                if (selectedQuarterbackId !== player.id) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ Only the selected quarterback can snap.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return false;
                }
            }

            if ($tick().current < MIN_SNAP_DELAY_TICKS) {
                $effect(($) => {
                    $.send({
                        message: t`⚠️ Wait a moment before snapping.`,
                        to: player.id,
                        color: COLOR.CRITICAL,
                    });
                });

                return false;
            }

            if (isTooFarFromBall(player.position, ballPosWithOffset)) {
                $effect(($) => {
                    $.send({
                        message: t`⚠️ You are too far from the ball to snap it.`,
                        to: player.id,
                        color: COLOR.CRITICAL,
                    });
                });

                return false;
            }

            const offensivePlayersPastLine =
                getOffensivePlayersBeyondLineOfScrimmage();

            if (offensivePlayersPastLine.length > 0) {
                $effect(($) => {
                    $.send({
                        message: t`⚠️ You cannot snap while a teammate is past the LOS.`,
                        to: player.id,
                        color: COLOR.CRITICAL,
                    });

                    $.send({
                        message: t`⚠️ You must get back behind the line of scrimmage to allow the snap!`,
                        to: offensivePlayersPastLine,
                        sound: "notification",
                        color: COLOR.CRITICAL,
                    });
                });

                return false;
            }

            $effect(($) => {
                $.send({
                    message: cn(
                        t`🏈 ${player.name} snaps it`,
                        t`ball is live`,
                        t`${BLITZ_BASE_DELAY_IN_SECONDS}s until the blitz!`,
                    ),
                    color: COLOR.ACTION,
                });
            });

            $global((state) => state.clearSnapProfile());

            $next({
                to: "SNAP",
                params: {
                    downState,
                    quarterbackId: player.id,
                },
            });
        }
    }

    function command(
        player: PlayerObject,
        spec: CommandSpec,
    ): CommandHandleResult {
        switch (spec.name) {
            case CLASSIC_COMMAND.DISTANCE: {
                if (!player.admin) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ Only admins can change game positioning.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return { handled: true };
                }

                const distance = parseIntegerInRange(
                    spec.args[0],
                    MIN_DISTANCE,
                    MAX_DISTANCE_CMD,
                );

                if (distance === null) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ Usage: !distance <1-20>.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return { handled: true };
                }

                const nextDownState: DownState = {
                    ...downState,
                    downAndDistance: {
                        ...downState.downAndDistance,
                        distance,
                    },
                };

                $effect(($) => {
                    $.send({
                        message: t`⚙️ ${player.name} set distance to ${distance}.`,
                        color: COLOR.SYSTEM,
                    });
                });

                $next({
                    to: "PRESNAP",
                    params: { downState: nextDownState },
                    disposal: "IMMEDIATE",
                });
            }
            case CLASSIC_COMMAND.DOWN: {
                if (!player.admin) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ Only admins can change game positioning.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return { handled: true };
                }

                const down = parseIntegerInRange(
                    spec.args[0],
                    MIN_DOWN,
                    MAX_DOWNS,
                );

                if (down === null) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ Usage: !down <1-4>.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return { handled: true };
                }

                const nextDownState: DownState = {
                    ...downState,
                    downAndDistance: {
                        ...downState.downAndDistance,
                        down,
                    },
                };

                $effect(($) => {
                    $.send({
                        message: t`⚙️ ${player.name} set down to ${down}.`,
                        color: COLOR.SYSTEM,
                    });
                });

                $next({
                    to: "PRESNAP",
                    params: { downState: nextDownState },
                    disposal: "IMMEDIATE",
                });
            }
            case CLASSIC_COMMAND.LINE_OF_SCRIMMAGE: {
                if (!player.admin) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ Only admins can change game positioning.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return { handled: true };
                }

                const side = parseTeamSide(spec.args[0]);
                const yards = parseIntegerInRange(
                    spec.args[1],
                    MIN_DISTANCE,
                    MAX_LOS_YARDS,
                );

                if (!side || yards === null) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ Usage: !los <red/blue> <1-50>.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return { handled: true };
                }

                const nextDownState: DownState = {
                    ...downState,
                    fieldPos: {
                        side,
                        yards,
                    },
                };

                const sideName = side === Team.RED ? t`Red` : t`Blue`;

                $effect(($) => {
                    $.send({
                        message: t`⚙️ ${player.name} moved LOS to ${sideName} ${yards}.`,
                        color: COLOR.SYSTEM,
                    });
                });

                $next({
                    to: "PRESNAP",
                    params: { downState: nextDownState },
                    disposal: "IMMEDIATE",
                });
            }
            case CLASSIC_COMMAND.FIELD_GOAL: {
                if (player.team !== offensiveTeam) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ Only the offense may call for a field goal.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return { handled: true };
                }

                if (fieldPos.side !== opposite(offensiveTeam)) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ Field goal is only available from the defensive side of the field.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return { handled: true };
                }

                if (isTooFarFromBall(player.position, ballPosWithOffset)) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ You are too far from the ball to attempt the field goal.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return { handled: true };
                }

                $effect(($) => {
                    $.send({
                        message: t`🥅 ${player.name} sets up for the field goal!`,
                        color: COLOR.ACTION,
                    });
                });

                $next({
                    to: "FIELD_GOAL",
                    params: {
                        downState,
                        kickerId: player.id,
                    },
                });
            }
            case CLASSIC_COMMAND.PUNT: {
                if (player.team !== offensiveTeam) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ Only the offense may punt.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return { handled: true };
                }

                if (isTooFarFromBall(player.position, ballPosWithOffset)) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ You are too far from the ball to punt.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return { handled: true };
                }

                if (isInRedZone(offensiveTeam, downState.fieldPos)) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ You cannot punt from the opponent red zone.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return { handled: true };
                }

                const offensivePlayersPastLine =
                    getOffensivePlayersBeyondLineOfScrimmage();

                if (offensivePlayersPastLine.length > 0) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ You cannot punt while a teammate is past the LOS.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return { handled: true };
                }

                $effect(($) => {
                    $.send({
                        message: config.flags.timeouts
                            ? t`🦵 ${player.name} sets up to punt. Kick within ${PUNT_KICK_TIMEOUT_SECONDS}s.`
                            : t`🦵 ${player.name} sets up to punt.`,
                        color: COLOR.ACTION,
                    });
                });

                $next({
                    to: "PUNT",
                    params: {
                        downState,
                    },
                });
            }
            case CLASSIC_COMMAND.REPOSITION: {
                if (!player.admin) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ Only admins can call for repositioning.`,
                            to: player.id,
                            color: COLOR.CRITICAL,
                        });
                    });

                    return { handled: true };
                }

                $effect(($) => {
                    $.send({
                        message: t`📍 ${player.name} repositions the players and ball.`,
                        to: player.id,
                        color: COLOR.ACTION,
                    });
                });

                const { possessionQuarterback } = $global();

                if (
                    possessionQuarterback &&
                    possessionQuarterback.team !== offensiveTeam
                ) {
                    $global((state) => state.clearPossessionQuarterback());
                }

                const selectedQuarterbackId =
                    requireQb && possessionQuarterback?.team === offensiveTeam
                        ? possessionQuarterback.playerId
                        : null;

                $setInitialPlayerPositions({
                    offensiveTeam,
                    ballPos,
                    ...(selectedQuarterbackId !== null
                        ? { quarterbackId: selectedQuarterbackId }
                        : {}),
                });

                return { handled: true };
            }
            default:
                return $createSharedCommandHandler({
                    options: {
                        undo: true,
                        info: { downState },
                        qb: { eligibleTeam: offensiveTeam },
                    },
                    player,
                    spec,
                });
        }
    }

    function $handleHikeTimeout() {
        if (!config.flags.timeouts) return;

        const { current: elapsedTicks } = $tick();
        if (elapsedTicks < HIKE_TIMEOUT_TICKS) return;

        const { event, downState: baseDownState } =
            incrementDownState(downState);
        const nextDownState = withLastBallYAtCenter(baseDownState);

        $dispose(() => {
            $setBallUnmoveable();
            $lockBall();
            $setBallInactive();
        });

        processDownEventIncrement({
            event,
            onNextDown() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "⏱️",
                            nextDownState,
                            t`hike clock expired`,
                            t`offense loses a down.`,
                        ),
                        color: COLOR.ALERT,
                    });
                });
            },
            onTurnoverOnDowns() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "⏱️",
                            nextDownState,
                            t`hike clock expired`,
                            t`TURNOVER ON DOWNS!`,
                        ),
                        color: COLOR.ALERT,
                    });
                });
            },
        });

        $next({
            to: "PRESNAP",
            params: { downState: nextDownState },
            wait: ticks({ seconds: 1 }),
            disposal: "IMMEDIATE",
        });
    }

    function $handleHikeTimeoutWarning(quarterbackId: number | null) {
        if (!config.flags.timeouts || quarterbackId === null) return;

        const { current: elapsedTicks } = $tick();
        if (elapsedTicks !== HIKE_WARNING_TICKS) return;

        $effect(($) => {
            $.send({
                message: t`⏱️ ${HIKE_WARNING_SECONDS_REMAINING}s left to hike.`,
                to: quarterbackId,
                color: COLOR.CRITICAL,
                sound: "notification",
            });
        });
    }

    function run(state: GameState) {
        const selectedQuarterbackId = requireQb
            ? $syncPossessionQuarterbackSelection({
                  team: offensiveTeam,
                  players: state.players,
              })
            : null;

        $handleHikeTimeoutWarning(selectedQuarterbackId);
        $handleHikeTimeout();

        if (config.flags.losBlocking) {
            $syncLineOfScrimmageBlocking();
        }
    }

    function inspect(): GameStateInspection {
        return { continuity: "before-play-start" };
    }

    return { run, chat, command, join, inspect };
}
