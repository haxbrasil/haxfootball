import type { GameState, GameStatePlayer } from "@runtime/engine";
import {
    advanceDownState,
    DownState,
    getInitialDownState,
    processDownEvent,
    withLastBallY,
} from "@modes/classic/shared/down";
import { cn, formatNames } from "@modes/classic/shared/message";
import { formatSafetyScoreMessage } from "@modes/classic/shared/safety";
import { isTouchdown, SCORES } from "@modes/classic/shared/scoring";
import {
    $before,
    $config,
    $dispose,
    $effect,
    $next,
    $stat,
} from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { AVATARS, findCatchers, opposite } from "@common/game/game";
import {
    calculateYardsGained,
    getFieldPosition,
    getDistanceToGoalLine,
    isInMainField,
    isOutOfBounds,
} from "@modes/classic/shared/stadium";
import { t } from "@lingui/core/macro";
import {
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@modes/classic/hooks/game";
import { $setBallActive, $setBallInactive } from "@modes/classic/hooks/game";
import { $global } from "@modes/classic/hooks/global";
import { $createSharedCommandHandler } from "@modes/classic/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";
import type { FieldPosition } from "@common/game/game";
import { Stat } from "@modes/classic/stats";
import type { Config } from "@modes/classic/config";

const FUMBLE_CATCHER_DISTANCE = 1.0;

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
    const { offensiveTeam, fieldPos, downAndDistance } = downState;
    const config = $config<Config>();

    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);
    $setBallInactive();

    function $detectFumble() {
        const beforeState = $before();
        const receiver = beforeState.players.find((p) => p.id === playerId);
        if (!receiver) return null;

        const defenders = beforeState.players.filter(
            (p) => p.team === opposite(offensiveTeam),
        );
        const immediateCatchers = findCatchers(
            receiver,
            defenders,
            FUMBLE_CATCHER_DISTANCE,
        );

        if (immediateCatchers.length < 2) return null;

        return {
            fieldPos: getFieldPosition(receiver.x),
            catcherNames: formatNames(immediateCatchers),
            catcherIds: immediateCatchers.map((p) => p.id),
        };
    }

    const fumbleInfo = $detectFumble();

    $effect(($) => {
        $.setAvatar(playerId, AVATARS.BALL);
    });

    $dispose(() => {
        $effect(($) => {
            $.setAvatar(playerId, null);
        });

        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
    });

    function $handleFumble(state: GameState) {
        if (!fumbleInfo) return;

        const player = state.players.find((p) => p.id === playerId);
        if (!player) return;

        const { fieldPos, catcherNames, catcherIds } = fumbleInfo;
        const nextDownState = getInitialDownState(
            opposite(offensiveTeam),
            fieldPos,
            player.y,
        );

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

            $stat({
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

            $stat({
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

        $stat({
            type: Stat.FumbleLost,
            playerId,
            value: {
                team: offensiveTeam,
                down: downState.downAndDistance.down,
                distance: downState.downAndDistance.distance,
                startFieldPosition: downState.fieldPos,
                endFieldPosition: fieldPos,
                yards,
                forcedBy: catcherIds,
            },
        });

        catcherIds.forEach((catcherId) => {
            $stat({
                type: Stat.ForcedFumble,
                playerId: catcherId,
                value: {
                    team: opposite(offensiveTeam),
                    down: downState.downAndDistance.down,
                    distance: downState.downAndDistance.distance,
                    startFieldPosition: downState.fieldPos,
                    endFieldPosition: fieldPos,
                    fumbler: playerId,
                },
            });
        });

        $effect(($) => {
            $.send({
                message: cn(
                    t`🏈 ${player.name} loses it on contact by ${catcherNames}`,
                    t`turnover at the ${fieldPos.yards}-yard line!`,
                ),
                color: COLOR.SPECIAL,
            });
            $.setAvatar(playerId, AVATARS.DIZZY);
            catcherIds.forEach((catcherId) => {
                $.setAvatar(catcherId, AVATARS.MUSCLE);
            });
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(playerId, null);
                catcherIds.forEach((catcherId) => {
                    $.setAvatar(catcherId, null);
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

        $global((state) =>
            state.incrementScore(offensiveTeam, SCORES.TOUCHDOWN),
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

            $stat({
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

            $stat({
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
        $stat({
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
            $stat({
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
            to: "EXTRA_POINT",
            params: {
                offensiveTeam,
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

                $stat({
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

                $stat({
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
                onFirstDown() {
                    $effect(($) => {
                        $.send({
                            message: cn(
                                "🏁",
                                nextDownState,
                                t`${frame.player.name} stepped out`,
                                t`FIRST DOWN!`,
                            ),
                            color: COLOR.READY,
                        });
                    });
                },
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
                            message: cn(nextDownState, t`TURNOVER ON DOWNS!`),
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
                        formatSafetyScoreMessage(config.flags.timeouts),
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
                to: "SAFETY",
                params: {
                    kickingTeam: offensiveTeam,
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

            $stat({
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

            $stat({
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
            $stat({
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
            onFirstDown() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "💥",
                            nextDownState,
                            t`${frame.player.name} brought down by ${catcherNames}`,
                            t`FIRST DOWN!`,
                        ),
                        color: COLOR.ALERT,
                    });
                });
            },
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
            $.setAvatar(playerId, AVATARS.CANCEL);

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

        if (fumbleInfo) {
            $handleFumble(state);
        }

        $handleTackle(frame);
    }

    return { run, command };
}
