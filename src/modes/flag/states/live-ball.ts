import type { GameState, GameStatePlayer } from "@runtime/engine";
import {
    advanceDownState,
    DownState,
    getRestartDownState,
    processDownEvent,
    withLastBallY,
} from "@modes/flag/shared/rules/down";
import { cn, formatNames } from "@modes/flag/shared/presentation/message";
import {
    getTouchdownScore,
    isTouchdown,
    SCORES,
} from "@modes/flag/shared/rules/scoring";
import { $dispose, $effect, $next, $event } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { AVATARS, findCatchers, opposite } from "@common/game/game";
import {
    calculateYardsGained,
    getFieldPosition,
    getDistanceToGoalLine,
    isInMainField,
    isOutOfBounds,
} from "@modes/flag/shared/field";
import { t } from "@lingui/core/macro";
import {
    $setLineOfScrimmage,
    $unsetLineOfScrimmage,
} from "@modes/flag/hooks/game";
import { $setBallActive, $setBallInactive } from "@modes/flag/hooks/game";
import { $global } from "@modes/flag/hooks/global";
import { $createSharedCommandHandler } from "@modes/flag/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";
import type { FieldPosition } from "@common/game/game";
import { Stat } from "@modes/flag/stats";

type Frame = {
    state: GameState;
    player: GameStatePlayer;
    defenders: GameStatePlayer[];
};

export function LiveBall({
    playerId,
    downState,
    passerId,
    catchFieldPos,
}: {
    playerId: number;
    downState: DownState;
    passerId?: number;
    catchFieldPos?: FieldPosition;
}) {
    const { offensiveTeam, fieldPos } = downState;

    $setLineOfScrimmage(fieldPos);
    $setBallInactive();

    $effect(($) => {
        $.setAvatar(playerId, AVATARS.BALL);
    });

    $dispose(() => {
        $effect(($) => {
            $.setAvatar(playerId, null);
        });

        $unsetLineOfScrimmage();
        $setBallActive();
    });

    function buildFrame(state: GameState): Frame | null {
        const player = state.players.find((p) => p.id === playerId);
        if (!player) return null;

        const defenders = state.players.filter(
            (p) => p.team === opposite(offensiveTeam),
        );

        return { state, player, defenders };
    }

    function $handleTouchdown(frame: Frame) {
        if (
            !isTouchdown({
                player: frame.player,
                offensiveTeam,
            })
        ) {
            return;
        }

        const { scores: scoreBeforeTouchdown } = $global();
        $global((state) =>
            state.incrementScore(
                offensiveTeam,
                getTouchdownScore(scoreBeforeTouchdown),
            ),
        );
        const yards = getDistanceToGoalLine(offensiveTeam, downState.fieldPos);
        const endFieldPosition = { side: opposite(offensiveTeam), yards: 0 };

        if (passerId) {
            const airYards = catchFieldPos
                ? calculateYardsGained(
                      offensiveTeam,
                      downState.fieldPos,
                      catchFieldPos,
                  )
                : yards;
            const yardsAfterCatch = yards - airYards;

            $event({
                type: Stat.PassCompletion,
                playerId: passerId,
                value: {
                    team: offensiveTeam,
                    down: downState.downAndDistance.down,
                    distance: downState.downAndDistance.distance,
                    startFieldPosition: downState.fieldPos,
                    endFieldPosition,
                    yards,
                    airYards,
                    yardsAfterCatch,
                    receiver: playerId,
                },
            });

            $event({
                type: Stat.Reception,
                playerId,
                value: {
                    team: offensiveTeam,
                    down: downState.downAndDistance.down,
                    distance: downState.downAndDistance.distance,
                    startFieldPosition: downState.fieldPos,
                    endFieldPosition,
                    yards,
                    airYards,
                    yardsAfterCatch,
                    passer: passerId,
                },
            });
        }
        $event({
            type: Stat.ReceivingTouchdown,
            playerId,
            value: {
                team: offensiveTeam,
                down: downState.downAndDistance.down,
                distance: downState.downAndDistance.distance,
                startFieldPosition: downState.fieldPos,
                endFieldPosition,
                yards,
                touchdown: true,
                ...(passerId ? { passer: passerId } : {}),
            },
        });

        if (passerId) {
            $event({
                type: Stat.PassingTouchdown,
                playerId: passerId,
                value: {
                    team: offensiveTeam,
                    down: downState.downAndDistance.down,
                    distance: downState.downAndDistance.distance,
                    startFieldPosition: downState.fieldPos,
                    endFieldPosition,
                    yards,
                    touchdown: true,
                    receiver: playerId,
                },
            });
        }

        const { scores } = $global();

        $effect(($) => {
            $.send({
                message: cn(
                    "🔥",
                    scores,
                    t`TOUCHDOWN by ${frame.player.name}!`,
                ),
                color: COLOR.SUCCESS,
                to: "mixed",
                sound: "notification",
                style: "bold",
            });
            $.setAvatar(playerId, AVATARS.FIRE);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(playerId, null);
            });
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: getRestartDownState(opposite(offensiveTeam)),
            },
            wait: ticks({ seconds: 3 }),
        });
    }

    function $handleOutOfBounds(frame: Frame) {
        if (!isOutOfBounds(frame.player)) return;

        const fieldPos = getFieldPosition(frame.player.x);

        if (isInMainField(frame.player)) {
            const { downState: baseDownState, event } = advanceDownState(
                downState,
                fieldPos,
            );
            const nextDownState = withLastBallY(baseDownState, frame.player.y);
            const yards = calculateYardsGained(
                offensiveTeam,
                downState.fieldPos,
                fieldPos,
            );

            if (passerId) {
                const airYards = catchFieldPos
                    ? calculateYardsGained(
                          offensiveTeam,
                          downState.fieldPos,
                          catchFieldPos,
                      )
                    : yards;
                const yardsAfterCatch = yards - airYards;

                $event({
                    type: Stat.PassCompletion,
                    playerId: passerId,
                    value: {
                        team: offensiveTeam,
                        down: downState.downAndDistance.down,
                        distance: downState.downAndDistance.distance,
                        startFieldPosition: downState.fieldPos,
                        endFieldPosition: fieldPos,
                        yards,
                        airYards,
                        yardsAfterCatch,
                        receiver: playerId,
                    },
                });

                $event({
                    type: Stat.Reception,
                    playerId,
                    value: {
                        team: offensiveTeam,
                        down: downState.downAndDistance.down,
                        distance: downState.downAndDistance.distance,
                        startFieldPosition: downState.fieldPos,
                        endFieldPosition: fieldPos,
                        yards,
                        airYards,
                        yardsAfterCatch,
                        passer: passerId,
                    },
                });
            }

            processDownEvent({
                event,
                onNextDown: {
                    onYardsGained(yardsGained: number) {
                        $effect(($) => {
                            $.send({
                                message: cn(
                                    "📈",
                                    nextDownState,
                                    t`${yardsGained}-yard gain`,
                                    t`next down.`,
                                ),
                                color: COLOR.READY,
                            });
                        });
                    },
                    onNoGain() {
                        $effect(($) => {
                            $.send({
                                message: cn(
                                    "➖",
                                    nextDownState,
                                    t`No gain`,
                                    t`next down.`,
                                ),
                                color: COLOR.READY,
                            });
                        });
                    },
                    onLoss(yardsLost: number) {
                        $effect(($) => {
                            $.send({
                                message: cn(
                                    "📉",
                                    nextDownState,
                                    t`${yardsLost}-yard loss`,
                                    t`next down.`,
                                ),
                                color: COLOR.READY,
                            });
                        });
                    },
                },
                onTurnoverOnDowns() {
                    $effect(($) => {
                        $.send({
                            message: cn(
                                "💥",
                                nextDownState,
                                t`TURNOVER ON DOWNS!`,
                            ),
                            color: COLOR.READY,
                        });
                    });
                },
            });

            $effect(($) => {
                $.setAvatar(playerId, AVATARS.CANCEL);
            });

            $dispose(() => {
                $effect(($) => {
                    $.setAvatar(playerId, null);
                });
            });

            $next({
                to: "PRESNAP",
                params: {
                    downState: nextDownState,
                },
                wait: ticks({ seconds: 1 }),
            });
        } else {
            $global((state) =>
                state.incrementScore(opposite(offensiveTeam), SCORES.SAFETY),
            );

            const { scores } = $global();

            $effect(($) => {
                $.send({
                    message: cn(
                        "🚪",
                        scores,
                        t`${frame.player.name} went out in the end zone`,
                        t`SAFETY!`,
                    ),
                    color: COLOR.ALERT,
                    to: "mixed",
                    sound: "notification",
                    style: "bold",
                });

                $.setAvatar(playerId, AVATARS.CLOWN);
            });

            $dispose(() => {
                $effect(($) => {
                    $.setAvatar(playerId, null);
                });
            });

            $next({
                to: "PRESNAP",
                params: {
                    downState: getRestartDownState(opposite(offensiveTeam)),
                },
                wait: ticks({ seconds: 2 }),
            });
        }
    }

    function $handleTackle(frame: Frame) {
        const catchers = findCatchers(frame.player, frame.defenders);
        if (catchers.length === 0) return;

        const catcherNames = formatNames(catchers);
        const fieldPos = getFieldPosition(frame.player.x);

        const { downState: baseDownState, event } = advanceDownState(
            downState,
            fieldPos,
        );
        const nextDownState = withLastBallY(baseDownState, frame.player.y);
        const yards = calculateYardsGained(
            offensiveTeam,
            downState.fieldPos,
            fieldPos,
        );

        if (passerId) {
            const airYards = catchFieldPos
                ? calculateYardsGained(
                      offensiveTeam,
                      downState.fieldPos,
                      catchFieldPos,
                  )
                : yards;
            const yardsAfterCatch = yards - airYards;

            $event({
                type: Stat.PassCompletion,
                playerId: passerId,
                value: {
                    team: offensiveTeam,
                    down: downState.downAndDistance.down,
                    distance: downState.downAndDistance.distance,
                    startFieldPosition: downState.fieldPos,
                    endFieldPosition: fieldPos,
                    yards,
                    airYards,
                    yardsAfterCatch,
                    receiver: playerId,
                },
            });

            $event({
                type: Stat.Reception,
                playerId,
                value: {
                    team: offensiveTeam,
                    down: downState.downAndDistance.down,
                    distance: downState.downAndDistance.distance,
                    startFieldPosition: downState.fieldPos,
                    endFieldPosition: fieldPos,
                    yards,
                    airYards,
                    yardsAfterCatch,
                    passer: passerId,
                },
            });
        }
        catchers.forEach((player) => {
            $event({
                type: Stat.Tackle,
                playerId: player.id,
                value: {
                    team: opposite(offensiveTeam),
                    down: downState.downAndDistance.down,
                    distance: downState.downAndDistance.distance,
                    startFieldPosition: downState.fieldPos,
                    endFieldPosition: fieldPos,
                    yards,
                    tackled: playerId,
                },
            });
        });

        processDownEvent({
            event,
            onNextDown: {
                onYardsGained(yardsGained: number) {
                    $effect(($) => {
                        $.send({
                            message: cn(
                                "💥",
                                nextDownState,
                                t`${frame.player.name} brought down by ${catcherNames}`,
                                t`${yardsGained} yard gain`,
                                t`next down.`,
                            ),
                            color: COLOR.ALERT,
                        });
                    });
                },
                onNoGain() {
                    $effect(($) => {
                        $.send({
                            message: cn(
                                "💥",
                                nextDownState,
                                t`${frame.player.name} brought down by ${catcherNames}`,
                                t`no gain`,
                                t`next down.`,
                            ),
                            color: COLOR.ALERT,
                        });
                    });
                },
                onLoss(yardsLost: number) {
                    $effect(($) => {
                        $.send({
                            message: cn(
                                "💥",
                                nextDownState,
                                t`${frame.player.name} brought down by ${catcherNames}`,
                                t`${yardsLost} yard loss`,
                                t`next down.`,
                            ),
                            color: COLOR.ALERT,
                        });
                    });
                },
            },
            onTurnoverOnDowns() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "💥",
                            nextDownState,
                            t`${frame.player.name} brought down by ${catcherNames}`,
                            t`TURNOVER ON DOWNS!`,
                        ),
                        color: COLOR.ALERT,
                    });
                });
            },
        });

        $effect(($) => {
            $.setAvatar(playerId, yards < 0 ? AVATARS.CANCEL : null);

            catchers.forEach((p) => {
                $.setAvatar(p.id, AVATARS.MUSCLE);
            });
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(playerId, null);

                catchers.forEach((p) => {
                    $.setAvatar(p.id, null);
                });
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

    function run(state: GameState) {
        const frame = buildFrame(state);
        if (!frame) return;

        $handleTouchdown(frame);
        $handleOutOfBounds(frame);
        $handleTackle(frame);
    }

    return { run, command };
}
