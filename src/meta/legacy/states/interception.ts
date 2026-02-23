import type {
    GameState,
    GameStateBall,
    GameStatePlayer,
} from "@runtime/engine";
import { FieldTeam } from "@runtime/models";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import { PointLike } from "@common/math/geometry";
import { ticks } from "@common/general/time";
import { AVATARS, findCatchers, opposite } from "@common/game/game";
import {
    $hideInterceptionPath,
    $setBallActive,
    $setBallInactive,
    $showInterceptionPath,
} from "@meta/legacy/hooks/game";
import {
    getFieldPosition,
    isCompletelyInsideMainField,
    isPartiallyOutsideMainField,
    isOutOfBounds,
    TOUCHBACK_YARD_LINE,
} from "@meta/legacy/shared/stadium";
import { getInitialDownState } from "@meta/legacy/shared/down";
import { isTouchdown, SCORES } from "@meta/legacy/shared/scoring";
import { cn, formatNames } from "@meta/legacy/shared/message";
import { $global } from "@meta/legacy/hooks/global";
import { t } from "@lingui/core/macro";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";

const MAX_PATH_DURATION = ticks({ seconds: 2 });

type EndzoneState = "TOUCHBACK" | "Safety";
type Frame = {
    state: GameState;
    player: GameStatePlayer;
    defenders: GameStatePlayer[];
};

export function Interception({
    playerId,
    ballState,
    intersectionPoint,
    playerTeam,
    endzoneState = "TOUCHBACK",
}: {
    playerId: number;
    ballState: GameStateBall;
    intersectionPoint: PointLike;
    playerTeam: FieldTeam;
    endzoneState?: EndzoneState;
}) {
    $setBallInactive();

    const { tickNumber: initialTickNumber } = $before();

    $effect(($) => {
        $.setAvatar(playerId, AVATARS.BALL);
    });

    $dispose(() => {
        $effect(($) => {
            $.setAvatar(playerId, null);
        });
    });

    $showInterceptionPath({
        start: { x: ballState.x, y: ballState.y },
        end: { x: intersectionPoint.x, y: intersectionPoint.y },
    });

    $dispose(() => {
        $hideInterceptionPath();
        $setBallActive();
    });

    function buildFrame(state: GameState): Frame | null {
        const player = state.players.find((p) => p.id === playerId);
        if (!player) return null;

        const defenders = state.players.filter(
            (p) => p.team === opposite(playerTeam),
        );

        return { state, player, defenders };
    }

    function $maybeHideInterceptionPath(state: GameState) {
        const elapsedTicks = state.tickNumber - initialTickNumber;

        if (elapsedTicks >= MAX_PATH_DURATION) {
            $hideInterceptionPath();
        }
    }

    function $advanceEndzoneState(frame: Frame) {
        if (
            !isCompletelyInsideMainField(frame.player) ||
            endzoneState !== "TOUCHBACK"
        ) {
            return;
        }

        $next({
            to: "INTERCEPTION",
            params: {
                playerId,
                intersectionPoint,
                ballState,
                playerTeam,
                endzoneState: "Safety",
            },
        });
    }

    function $handleTouchdown(frame: Frame) {
        if (
            !isTouchdown({
                player: frame.player,
                offensiveTeam: playerTeam,
            })
        ) {
            return;
        }

        $global((state) => state.incrementScore(playerTeam, SCORES.TOUCHDOWN));

        const { scores } = $global();

        $effect(($) => {
            $.send({
                message: cn("🔥", scores, t`PICK-SIX by ${frame.player.name}!`),
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
                offensiveTeam: playerTeam,
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
                    message: t`🚪 ${frame.player.name} stepped out on the interception return.`,
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
                        playerTeam,
                        fieldPos,
                        frame.player.y,
                    ),
                },
                wait: ticks({ seconds: 1 }),
            });
        } else {
            $global((state) =>
                state.incrementScore(opposite(playerTeam), SCORES.SAFETY),
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
                    kickingTeam: playerTeam,
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
                            downState: getInitialDownState(playerTeam, {
                                yards: TOUCHBACK_YARD_LINE,
                                side: playerTeam,
                            }),
                        },
                        wait: ticks({ seconds: 1 }),
                    });
                case "Safety":
                    $global((state) =>
                        state.incrementScore(
                            opposite(playerTeam),
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
                            kickingTeam: playerTeam,
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
                        playerTeam,
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
                info: { stateMessage: t`Interception` },
            },
            player,
            spec,
        });
    }

    function run(state: GameState) {
        $maybeHideInterceptionPath(state);

        const frame = buildFrame(state);
        if (!frame) return;

        $advanceEndzoneState(frame);
        $handleTouchdown(frame);
        $handleOutOfBounds(frame);
        $handleTackle(frame);
    }

    return { run, command };
}
