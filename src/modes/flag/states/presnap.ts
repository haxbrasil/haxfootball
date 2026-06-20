import { type FieldTeam, isFieldTeam, Team } from "@runtime/models";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { CommandHandleResult, CommandSpec } from "@core/commands";
import { parseIntegerInRange, parseTeamSide } from "@common/game/parsing";
import { ticks } from "@common/general/time";
import {
    BALL_OFFSET_YARDS,
    calculateDirectionalGain,
    calculateSnapBallPosition,
} from "@modes/flag/shared/field";
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
} from "@modes/flag/hooks/physics";
import { t } from "@lingui/core/macro";
import { cn } from "@modes/flag/shared/presentation/message";
import {
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $unsetLineOfScrimmage,
} from "@modes/flag/hooks/game";
import {
    DownState,
    incrementDownState,
    MAX_DOWNS,
    processDownEventIncrement,
    withLastBallYAtCenter,
} from "@modes/flag/shared/rules/down";
import assert from "node:assert";
import { $global } from "@modes/flag/hooks/global";
import {
    buildInitialPlayerPositions,
    DEFAULT_INITIAL_POSITIONING_RELATIVE_LINES,
} from "@modes/flag/shared/formation/initial-positioning";
import { $createSharedCommandHandler } from "@modes/flag/shared/commands";
import { FLAG_COMMAND } from "@modes/flag/shared/commands/names";
import { COLOR } from "@common/general/color";
import { type Config } from "@modes/flag/config";
import { $syncLineOfScrimmageBlocking } from "@modes/flag/hooks/los";
import { BLITZ_BASE_DELAY_IN_SECONDS } from "@modes/flag/shared/rules/blitz";
import {
    isTooFarFromBall,
    MIN_SNAP_DELAY_TICKS,
} from "@modes/flag/shared/rules/snap";
import {
    HIKE_TIMEOUT_SECONDS,
    HIKE_TIMEOUT_TICKS,
    HIKE_WARNING_SECONDS_REMAINING,
    HIKE_WARNING_TICKS,
} from "@modes/flag/shared/rules/snap";
import type { GameStateInspection } from "@runtime/inspection";

const MIN_DISTANCE = 1;
const MIN_DOWN = 1;
const MAX_LOS_YARDS = 50;

type PossessionQuarterbackPlayer = Pick<PlayerObject, "id" | "team">;

function getLastQuarterbackId({
    offensiveTeam,
    players,
}: {
    offensiveTeam: FieldTeam;
    players: PossessionQuarterbackPlayer[];
}): number | null {
    const { possessionQuarterback } = $global();

    if (!possessionQuarterback) {
        return null;
    }

    if (possessionQuarterback.team !== offensiveTeam) {
        $global((state) => state.clearPossessionQuarterback());
        return null;
    }

    const lastQuarterback = players.find(
        (player) =>
            player.id === possessionQuarterback.playerId &&
            player.team === offensiveTeam,
    );

    if (!lastQuarterback) {
        $global((state) => state.clearPossessionQuarterback());
        return null;
    }

    return lastQuarterback.id;
}

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

        const resolvedQuarterbackId =
            quarterbackId ?? getLastQuarterbackId({ offensiveTeam, players });

        const initialPlayerPositions = buildInitialPlayerPositions({
            players,
            offensiveTeam,
            ballPos,
            relativeLines: DEFAULT_INITIAL_POSITIONING_RELATIVE_LINES,
            snapProfile,
            ...(resolvedQuarterbackId !== null
                ? { offensiveAnchorPlayerId: resolvedQuarterbackId }
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

    const config = $config<Config>();

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

    $effect(($) => {
        $.setBall({ ...ballPosWithOffset, xspeed: 0, yspeed: 0 });
    });

    if (config.flags.timeouts) {
        $effect(($) => {
            $.send({
                message: t`⏱️ Hike within ${HIKE_TIMEOUT_SECONDS}s.`,
                to: $.getPlayerList().filter(
                    (player) => player.team === offensiveTeam,
                ),
                color: COLOR.WARNING,
            });
        });
    }

    $setInitialPlayerPositions({
        offensiveTeam,
        ballPos,
    });

    $dispose(() => {
        $setBallMoveable();
        $unlockBall();
        $unsetLineOfScrimmage();

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
        const selectedQuarterbackId = getLastQuarterbackId({
            offensiveTeam,
            players: state.players,
        });

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
            $global((state) =>
                state.setPossessionQuarterback(player.id, offensiveTeam),
            );

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
            case FLAG_COMMAND.DOWN: {
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
            case FLAG_COMMAND.LINE_OF_SCRIMMAGE: {
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
            case FLAG_COMMAND.REPOSITION: {
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
                    possessionQuarterback?.team === offensiveTeam
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

    function $handleHikeTimeoutWarning() {
        if (!config.flags.timeouts) return;

        const { current: elapsedTicks } = $tick();
        if (elapsedTicks !== HIKE_WARNING_TICKS) return;

        $effect(($) => {
            $.send({
                message: t`⏱️ ${HIKE_WARNING_SECONDS_REMAINING}s left to hike.`,
                to: $.getPlayerList().filter(
                    (player) => player.team === offensiveTeam,
                ),
                color: COLOR.CRITICAL,
                sound: "notification",
            });
        });
    }

    function run(_state: GameState) {
        $handleHikeTimeoutWarning();
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
