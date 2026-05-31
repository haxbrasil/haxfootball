import { $config, $dispose, $effect, $next, $stat } from "@runtime/hooks";
import type { FieldTeam } from "@runtime/models";
import { ticks } from "@common/general/time";
import {
    AVATARS,
    type FieldPosition,
    findCatchers,
    opposite,
} from "@common/game/game";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { t } from "@lingui/core/macro";
import {
    getFieldPosition,
    calculateYardsGained,
    isCompletelyInsideMainField,
    isInMainField,
    isOutOfBounds,
    isPartiallyOutsideMainField,
    TOUCHBACK_YARD_LINE,
} from "@modes/classic/shared/field";
import { getInitialDownState } from "@modes/classic/shared/rules/down";
import {
    getTouchdownScore,
    isTouchdown,
    SCORES,
} from "@modes/classic/shared/rules/scoring";
import { cn, formatNames } from "@modes/classic/shared/presentation/message";
import { formatSafetyScoreMessage } from "@modes/classic/shared/rules/safety";
import { $setBallActive, $setBallInactive } from "@modes/classic/hooks/game";
import { $global } from "@modes/classic/hooks/global";
import { $createSharedCommandHandler } from "@modes/classic/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";
import { Stat } from "@modes/classic/stats";
import type { Config } from "@modes/classic/config";

type EndzoneState = "TOUCHBACK" | "Safety";
type Frame = {
    player: GameStatePlayer;
    defenders: GameStatePlayer[];
};

export function PuntReturn({
    playerId,
    receivingTeam,
    startFieldPosition,
    endzoneState = "TOUCHBACK",
}: {
    playerId: number;
    receivingTeam: FieldTeam;
    startFieldPosition: FieldPosition;
    endzoneState?: EndzoneState;
}) {
    const config = $config<Config>();

    $effect(($) => {
        $.setAvatar(playerId, AVATARS.BALL);
    });

    $dispose(() => {
        $effect(($) => {
            $.setAvatar(playerId, null);
        });

        $setBallActive();
    });

    $setBallInactive();

    function buildFrame(state: GameState): Frame | null {
        const player = state.players.find((p) => p.id === playerId);
        if (!player) return null;

        const defenders = state.players.filter(
            (p) => p.team === opposite(receivingTeam),
        );

        return { player, defenders };
    }

    function $advanceEndzoneState(frame: Frame) {
        if (
            !isCompletelyInsideMainField(frame.player) ||
            endzoneState !== "TOUCHBACK"
        ) {
            return;
        }

        $next({
            to: "PUNT_RETURN",
            params: {
                playerId,
                receivingTeam,
                startFieldPosition,
                endzoneState: "Safety",
            },
        });
    }

    function $handleTouchdown(frame: Frame) {
        if (
            !isTouchdown({
                player: frame.player,
                offensiveTeam: receivingTeam,
            })
        ) {
            return;
        }

        const { scores: scoreBeforeTouchdown } = $global();
        $global((state) =>
            state.incrementScore(
                receivingTeam,
                getTouchdownScore(scoreBeforeTouchdown),
            ),
        );
        $stat({
            type: Stat.Return,
            playerId,
            value: {
                team: receivingTeam,
                startFieldPosition,
                yards: calculateYardsGained(
                    receivingTeam,
                    startFieldPosition,
                    getFieldPosition(frame.player.x),
                ),
                touchdown: true,
            },
        });
        $stat({
            type: Stat.ReturnTouchdown,
            playerId,
            value: {
                team: receivingTeam,
                startFieldPosition,
                touchdown: true,
            },
        });

        const { scores } = $global();

        $effect(($) => {
            $.send({
                message: cn(
                    "🔥",
                    scores,
                    t`Punt return touchdown by ${frame.player.name}!`,
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
                offensiveTeam: receivingTeam,
            },
            wait: ticks({ seconds: 3 }),
        });
    }

    function $handleOutOfBounds(frame: Frame) {
        if (!isOutOfBounds(frame.player)) return;

        const fieldPos = getFieldPosition(frame.player.x);

        if (isCompletelyInsideMainField(frame.player)) {
            $stat({
                type: Stat.Return,
                playerId,
                value: {
                    team: receivingTeam,
                    startFieldPosition,
                    endFieldPosition: fieldPos,
                    yards: calculateYardsGained(
                        receivingTeam,
                        startFieldPosition,
                        fieldPos,
                    ),
                },
            });

            $effect(($) => {
                $.send({
                    message: t`🚪 ${frame.player.name} stepped out on the punt return.`,
                    color: COLOR.WARNING,
                });

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
                    downState: getInitialDownState(
                        receivingTeam,
                        fieldPos,
                        frame.player.y,
                    ),
                },
                wait: ticks({ seconds: 1 }),
            });
        } else {
            $global((state) =>
                state.incrementScore(opposite(receivingTeam), SCORES.SAFETY),
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
                    kickingTeam: receivingTeam,
                },
                wait: ticks({ seconds: 2 }),
            });
        }
    }

    function $handleTackle(frame: Frame) {
        const catchers = findCatchers(frame.player, frame.defenders);

        if (catchers.length === 0) return;

        if (isPartiallyOutsideMainField(frame.player)) {
            switch (endzoneState) {
                case "TOUCHBACK":
                    $effect(($) => {
                        $.send({
                            message: cn(
                                t`🛑 ${frame.player.name} is down in the end zone`,
                                t`touchback.`,
                            ),
                            color: COLOR.ALERT,
                        });

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
                            downState: getInitialDownState(receivingTeam, {
                                yards: TOUCHBACK_YARD_LINE,
                                side: receivingTeam,
                            }),
                        },
                        wait: ticks({ seconds: 1 }),
                    });
                case "Safety":
                    $global((state) =>
                        state.incrementScore(
                            opposite(receivingTeam),
                            SCORES.SAFETY,
                        ),
                    );

                    const { scores } = $global();

                    $effect(($) => {
                        $.send({
                            message: cn(
                                "🛑",
                                scores,
                                t`${frame.player.name} is down in the end zone`,
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
                            kickingTeam: receivingTeam,
                        },
                        wait: ticks({ seconds: 2 }),
                    });
            }
        } else {
            const catcherNames = formatNames(catchers);
            const fieldPos = getFieldPosition(frame.player.x);
            $stat({
                type: Stat.Return,
                playerId,
                value: {
                    team: receivingTeam,
                    startFieldPosition,
                    endFieldPosition: fieldPos,
                    yards: calculateYardsGained(
                        receivingTeam,
                        startFieldPosition,
                        fieldPos,
                    ),
                    tacklers: catchers.map((player) => player.id),
                },
            });
            catchers.forEach((player) => {
                $stat({
                    type: Stat.Tackle,
                    playerId: player.id,
                    value: {
                        team: opposite(receivingTeam),
                        endFieldPosition: fieldPos,
                        tackled: playerId,
                    },
                });
            });

            $effect(($) => {
                $.send({
                    message: t`💥 ${frame.player.name} brought down by ${catcherNames}!`,
                    color: COLOR.ALERT,
                });

                catchers.forEach((p) => {
                    $.setAvatar(p.id, AVATARS.MUSCLE);
                });

                $.setAvatar(playerId, AVATARS.CANCEL);
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
                    downState: getInitialDownState(
                        receivingTeam,
                        fieldPos,
                        frame.player.y,
                    ),
                },
                wait: ticks({ seconds: 1 }),
            });
        }
    }

    function leave(player: GameStatePlayer) {
        if (player.id === playerId) {
            if (isInMainField(player)) {
                const fieldPos = getFieldPosition(player.x);

                $effect(($) => {
                    $.send({
                        message: t`🚪 ${player.name} left during the punt return!`,
                        color: COLOR.WARNING,
                    });
                });

                $next({
                    to: "PRESNAP",
                    params: {
                        downState: getInitialDownState(
                            receivingTeam,
                            fieldPos,
                            player.y,
                        ),
                    },
                    wait: ticks({ seconds: 1 }),
                });
            } else {
                switch (endzoneState) {
                    case "TOUCHBACK":
                        $effect(($) => {
                            $.send({
                                message: cn(
                                    t`🚪 ${player.name} left from the end zone`,
                                    t`touchback.`,
                                ),
                                color: COLOR.WARNING,
                            });
                        });

                        $next({
                            to: "PRESNAP",
                            params: {
                                downState: getInitialDownState(receivingTeam, {
                                    yards: TOUCHBACK_YARD_LINE,
                                    side: receivingTeam,
                                }),
                            },
                            wait: ticks({ seconds: 1 }),
                        });
                    case "Safety":
                        $global((state) =>
                            state.incrementScore(
                                opposite(receivingTeam),
                                SCORES.SAFETY,
                            ),
                        );

                        const { scores } = $global();

                        $effect(($) => {
                            $.send({
                                message: cn(
                                    "🚪",
                                    scores,
                                    t`${player.name} left from the end zone`,
                                    formatSafetyScoreMessage(
                                        config.flags.timeouts,
                                    ),
                                ),
                                color: COLOR.ALERT,
                                to: "mixed",
                                sound: "notification",
                                style: "bold",
                            });
                        });

                        $next({
                            to: "SAFETY",
                            params: {
                                kickingTeam: receivingTeam,
                            },
                            wait: ticks({ seconds: 2 }),
                        });
                }
            }
        }
    }

    function command(player: PlayerObject, spec: CommandSpec) {
        return $createSharedCommandHandler({
            options: {
                undo: true,
                info: { stateMessage: t`Punt return` },
            },
            player,
            spec,
        });
    }

    function run(state: GameState) {
        const frame = buildFrame(state);
        if (!frame) return;

        $advanceEndzoneState(frame);
        $handleTouchdown(frame);
        $handleOutOfBounds(frame);
        $handleTackle(frame);
    }

    return { run, leave, command };
}
