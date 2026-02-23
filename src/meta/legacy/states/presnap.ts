import { type FieldTeam, isFieldTeam, Team } from "@runtime/models";
import type { GameStatePlayer } from "@runtime/engine";
import { CommandHandleResult, CommandSpec } from "@runtime/commands";
import { opposite } from "@common/game/game";
import { parseIntegerInRange, parseTeamSide } from "@common/game/parsing";
import {
    BALL_OFFSET_YARDS,
    calculateDirectionalGain,
    calculateSnapBallPosition,
    isInRedZone,
} from "@meta/legacy/shared/stadium";
import {
    $before,
    $checkpoint,
    $config,
    $dispose,
    $effect,
    $next,
    $tick,
} from "@runtime/runtime";
import {
    $lockBall,
    $setBallMoveable,
    $setBallUnmoveable,
    $unlockBall,
} from "@meta/legacy/hooks/physics";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/shared/message";
import {
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { DownState, MAX_DOWNS } from "@meta/legacy/shared/down";
import assert from "node:assert";
import { $global } from "@meta/legacy/hooks/global";
import {
    buildInitialPlayerPositions,
    type InitialPositioningRelativeLines,
} from "@meta/legacy/shared/initial-positioning";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import { COLOR } from "@common/general/color";
import { type Config } from "@meta/legacy/config";
import { $syncLineOfScrimmageBlocking } from "@meta/legacy/hooks/los";
import { BLITZ_BASE_DELAY_IN_SECONDS } from "@meta/legacy/shared/blitz";
import {
    isTooFarFromBall,
    MIN_SNAP_DELAY_TICKS,
} from "@meta/legacy/shared/snap";

const DEFAULT_INITIAL_RELATIVE_POSITIONS: InitialPositioningRelativeLines = {
    offensive: {
        start: { x: 100, y: -100 },
        end: { x: 100, y: 100 },
    },
    defensive: {
        start: { x: -100, y: -100 },
        end: { x: -100, y: 100 },
    },
};

const MIN_DISTANCE = 1;
const MAX_DISTANCE_CMD = 20;
const MIN_DOWN = 1;
const MAX_LOS_YARDS = 50;

function $setInitialPlayerPositions(
    offensiveTeam: FieldTeam,
    ballPos: Position,
    targetPlayerId?: number,
) {
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
            relativeLines: DEFAULT_INITIAL_RELATIVE_POSITIONS,
            snapProfile,
        });

        const playerPositions =
            typeof targetPlayerId === "number"
                ? initialPlayerPositions.filter(
                      ({ id }) => id === targetPlayerId,
                  )
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
    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);

    $effect(($) => {
        $.setBall({ ...ballPosWithOffset, xspeed: 0, yspeed: 0 });
    });

    $setInitialPlayerPositions(offensiveTeam, ballPos);

    $dispose(() => {
        $setBallMoveable();
        $unlockBall();
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();

        const config = $config<Config>();

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
        $setInitialPlayerPositions(offensiveTeam, ballPos, player.id);
    }

    function chat(player: PlayerObject, message: string): false | void {
        const normalizedMessage = message.trim().toLowerCase();
        const isHikeCommand = normalizedMessage === "hike";

        if (isHikeCommand) {
            if (player.team !== offensiveTeam) {
                return;
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
            case "distance": {
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
            case "down": {
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
            case "los": {
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
            case "fg": {
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
                    params: { downState, kickerId: player.id },
                });
            }
            case "punt": {
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
                        message: t`🦵 ${player.name} punts it away!`,
                        color: COLOR.ACTION,
                    });
                });

                $next({
                    to: "PUNT",
                    params: { downState },
                });
            }
            case "reposition": {
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

                $setInitialPlayerPositions(offensiveTeam, ballPos);

                return { handled: true };
            }
            default:
                return $createSharedCommandHandler({
                    options: {
                        undo: true,
                        info: { downState },
                    },
                    player,
                    spec,
                });
        }
    }

    function run() {
        const config = $config<Config>();

        if (config.flags.losBlocking) {
            $syncLineOfScrimmageBlocking();
        }
    }

    return { run, chat, command, join };
}
