import { $dispose, $effect, $next } from "@runtime/hooks";
import type { FieldTeam } from "@runtime/models";
import { ticks } from "@common/general/time";
import { AVATARS, findCatchers, opposite } from "@common/game/game";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { t } from "@lingui/core/macro";
import {
    getFieldPosition,
    isCompletelyInsideMainField,
    isInMainField,
    isOutOfBounds,
    isPartiallyOutsideMainField,
    TOUCHBACK_YARD_LINE,
} from "@meta/legacy/shared/stadium";
import { getInitialDownState } from "@meta/legacy/shared/down";
import { isTouchdown, SCORES } from "@meta/legacy/shared/scoring";
import { cn, formatNames } from "@meta/legacy/shared/message";
import { $setBallActive, $setBallInactive } from "@meta/legacy/hooks/game";
import {
    $global,
    $syncPossessionQuarterbackSelection,
} from "@meta/legacy/hooks/global";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";

type EndzoneState = "TOUCHBACK" | "Safety";
type Frame = {
    player: GameStatePlayer;
    defenders: GameStatePlayer[];
};

export function KickoffReturn({
    playerId,
    receivingTeam,
    endzoneState = "TOUCHBACK",
}: {
    playerId: number;
    receivingTeam: FieldTeam;
    endzoneState?: EndzoneState;
}) {
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

    function leave(player: GameStatePlayer) {
        if (player.id === playerId) {
            if (isInMainField(player)) {
                const fieldPos = getFieldPosition(player.x);

                $effect(($) => {
                    $.send({
                        message: t`🚪 ${player.name} left during the kickoff return!`,
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
                                    t`SAFETY!`,
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
                                kickingTeam: opposite(receivingTeam),
                            },
                            wait: ticks({ seconds: 2 }),
                        });
                }
            }
        }
    }

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
            to: "KICKOFF_RETURN",
            params: {
                playerId,
                receivingTeam,
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

        $global((state) =>
            state.incrementScore(receivingTeam, SCORES.TOUCHDOWN),
        );

        const { scores } = $global();

        $effect(($) => {
            $.send({
                message: cn(
                    "🔥",
                    scores,
                    t`kickoff return touchdown by ${frame.player.name}!`,
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
            $effect(($) => {
                $.send({
                    message: t`🚪 ${frame.player.name} stepped out on the kickoff return.`,
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
                            kickingTeam: opposite(receivingTeam),
                        },
                        wait: ticks({ seconds: 2 }),
                    });
            }
        } else {
            const catcherNames = formatNames(catchers);
            const fieldPos = getFieldPosition(frame.player.x);

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

    function command(player: PlayerObject, spec: CommandSpec) {
        return $createSharedCommandHandler({
            options: {
                undo: true,
                info: { stateMessage: t`Kickoff return` },
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

        const frame = buildFrame(state);
        if (!frame) return;

        $advanceEndzoneState(frame);
        $handleTouchdown(frame);
        $handleOutOfBounds(frame);
        $handleTackle(frame);
    }

    return { run, leave, command };
}
