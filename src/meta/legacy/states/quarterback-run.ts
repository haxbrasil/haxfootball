import type { GameState, GameStatePlayer } from "@runtime/engine";
import {
    advanceDownState,
    DownState,
    processDownEvent,
    withLastBallY,
} from "@meta/legacy/shared/down";
import { cn, formatNames } from "@meta/legacy/shared/message";
import { isTouchdown, SCORES } from "@meta/legacy/shared/scoring";
import { $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { AVATARS, findCatchers, opposite } from "@common/game/game";
import {
    getFieldPosition,
    isInMainField,
    isOutOfBounds,
} from "@meta/legacy/shared/stadium";
import { t } from "@lingui/core/macro";
import {
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { $setBallActive, $setBallInactive } from "@meta/legacy/hooks/game";
import { $global } from "@meta/legacy/hooks/global";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";

type Frame = {
    player: GameStatePlayer;
    defenders: GameStatePlayer[];
};

export function QuarterbackRun({
    playerId,
    downState,
}: {
    playerId: number;
    downState: DownState;
}) {
    const { offensiveTeam, fieldPos, downAndDistance } = downState;

    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);
    $setBallInactive();

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

    function buildFrame(state: GameState): Frame | null {
        const player = state.players.find((p) => p.id === playerId);
        if (!player) return null;

        const defenders = state.players.filter(
            (p) => p.team === opposite(offensiveTeam),
        );

        return { player, defenders };
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
        $handleTackle(frame);
    }

    return { run, command };
}
