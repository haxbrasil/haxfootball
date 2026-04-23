import type { GameState, GameStatePlayer } from "@runtime/engine";
import { $dispose, $effect, $global, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { AVATARS, findCatchers, opposite } from "@common/game/game";
import {
    advanceDownState,
    DownState,
    processDownEvent,
    withLastBallY,
} from "@meta/legacy/shared/down";
import { cn, formatNames } from "@meta/legacy/shared/message";
import {
    applyOffensivePenalty,
    processOffensivePenalty,
} from "@meta/legacy/shared/penalty";
import {
    calculateDirectionalGain,
    getFieldPosition,
    getPositionFromFieldPosition,
    isInMainField,
    isOutOfBounds,
} from "@meta/legacy/shared/stadium";
import { t } from "@lingui/core/macro";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import { findEligibleBallCatchers } from "@meta/legacy/shared/reception";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";
import { SCORES } from "@meta/legacy/shared/scoring";

const OFFENSIVE_FOUL_PENALTY_YARDS = 5;

type Frame = {
    state: GameState;
    quarterback: GameStatePlayer;
    defenders: GameStatePlayer[];
    quarterbackCrossedLineOfScrimmage: boolean;
};

export function Blitz({
    downState,
    quarterbackId,
    ballIsDead = false,
}: {
    downState: DownState;
    quarterbackId: number;
    ballIsDead?: boolean;
}) {
    const { offensiveTeam, fieldPos, downAndDistance } = downState;
    const lineOfScrimmageX = getPositionFromFieldPosition(fieldPos);

    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);

    if (ballIsDead) {
        $setBallInactive();
    } else {
        $setBallActive();
    }

    $dispose(() => {
        $effect(($) => {
            $.setAvatar(quarterbackId, null);
        });

        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
    });

    $effect(($) => {
        $.setAvatar(quarterbackId, AVATARS.BALL);
    });

    function buildFrame(state: GameState): Frame | null {
        const quarterback = state.players.find((p) => p.id === quarterbackId);
        if (!quarterback) return null;

        const defenders = state.players.filter(
            (player) => player.team !== offensiveTeam,
        );

        const quarterbackCrossedLineOfScrimmage =
            calculateDirectionalGain(
                offensiveTeam,
                quarterback.x - lineOfScrimmageX,
            ) > 0;

        return {
            state,
            quarterback,
            defenders,
            quarterbackCrossedLineOfScrimmage,
        };
    }

    function $handleQuarterbackKick(frame: Frame) {
        if (ballIsDead || !frame.quarterback.isKickingBall) return;

        $next({
            to: "SNAP_IN_FLIGHT",
            params: { downState },
        });
    }

    function $handleOffensiveIllegalTouching(frame: Frame) {
        const offensiveTouchers = findEligibleBallCatchers(
            frame.state.ball,
            frame.state.players.filter(
                (player) =>
                    player.team === offensiveTeam &&
                    player.id !== frame.quarterback.id,
            ),
        );

        if (offensiveTouchers.length === 0) return;

        const offenderNames = formatNames(offensiveTouchers);

        const penaltyResult = applyOffensivePenalty(
            downState,
            -OFFENSIVE_FOUL_PENALTY_YARDS,
        );

        processOffensivePenalty({
            event: penaltyResult.event,
            onNextDown() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            penaltyResult.downState,
                            t`Illegal touch by ${offenderNames}`,
                            t`${OFFENSIVE_FOUL_PENALTY_YARDS}-yard penalty`,
                            t`loss of down.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });
            },
            onTurnoverOnDowns() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            penaltyResult.downState,
                            t`Illegal touch by ${offenderNames}`,
                            t`${OFFENSIVE_FOUL_PENALTY_YARDS}-yard penalty`,
                            t`turnover on downs.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });
            },
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: penaltyResult.downState,
            },
        });
    }

    function $handleDefensiveTouching(frame: Frame) {
        if (ballIsDead) return;

        const defensiveTouchers = findEligibleBallCatchers(
            frame.state.ball,
            frame.defenders,
        );

        if (defensiveTouchers.length === 0) return;

        $setBallInactive();
        $next({
            to: "BLITZ",
            params: {
                downState,
                quarterbackId,
                ballIsDead: true,
            },
        });
    }

    function $handleQuarterbackCrossedLine(frame: Frame) {
        if (!frame.quarterbackCrossedLineOfScrimmage) return;

        $effect(($) => {
            $.send({
                message: cn(
                    t`🏃 Quarterback crossed the LOS`,
                    t`quarterback run is live.`,
                ),
                color: COLOR.ACTION,
            });
        });

        $next({
            to: "QUARTERBACK_RUN",
            params: {
                playerId: quarterbackId,
                downState,
            },
        });
    }

    function $handleQuarterbackOutOfBounds(frame: Frame) {
        if (!isOutOfBounds(frame.quarterback)) return;

        const fieldPos = getFieldPosition(frame.quarterback.x);

        if (isInMainField(frame.quarterback)) {
            const { downState: baseDownState, event } = advanceDownState(
                downState,
                fieldPos,
            );
            const nextDownState = withLastBallY(
                baseDownState,
                frame.quarterback.y,
            );

            processDownEvent({
                event,
                onFirstDown() {
                    $effect(($) => {
                        $.send({
                            message: cn(
                                "🏁",
                                nextDownState,
                                t`${frame.quarterback.name} stepped out`,
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
                $.setAvatar(quarterbackId, AVATARS.CANCEL);
            });

            $dispose(() => {
                $effect(($) => {
                    $.setAvatar(quarterbackId, null);
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
                        t`Quarterback ${frame.quarterback.name} went out in the end zone`,
                        t`SAFETY!`,
                    ),
                    color: COLOR.ALERT,
                    to: "mixed",
                    sound: "notification",
                    style: "bold",
                });

                $.setAvatar(quarterbackId, AVATARS.CLOWN);
            });

            $dispose(() => {
                $effect(($) => {
                    $.setAvatar(quarterbackId, null);
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

    function $handleQuarterbackSacked(frame: Frame) {
        const catchers = findCatchers(frame.quarterback, frame.defenders);
        if (catchers.length === 0) return;

        const catcherNames = formatNames(catchers);
        const fieldPos = getFieldPosition(frame.quarterback.x);

        const { downState: baseDownState, event } = advanceDownState(
            downState,
            fieldPos,
        );
        const nextDownState = withLastBallY(baseDownState, frame.quarterback.y);

        processDownEvent({
            event,
            onFirstDown() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "💥",
                            nextDownState,
                            t`Quarterback ${frame.quarterback.name} sacked by ${catcherNames}`,
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
                                t`Quarterback ${frame.quarterback.name} sacked by ${catcherNames}`,
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
                                t`Quarterback ${frame.quarterback.name} sacked by ${catcherNames}`,
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
                                t`Quarterback ${frame.quarterback.name} sacked by ${catcherNames}`,
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
                            t`Quarterback ${frame.quarterback.name} sacked by ${catcherNames}`,
                            t`TURNOVER ON DOWNS!`,
                        ),
                        color: COLOR.ALERT,
                    });
                });
            },
        });

        $effect(($) => {
            $.setAvatar(quarterbackId, AVATARS.CANCEL);

            catchers.forEach((player) => {
                $.setAvatar(player.id, AVATARS.MUSCLE);
            });
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(quarterbackId, null);

                catchers.forEach((player) => {
                    $.setAvatar(player.id, null);
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

        $handleQuarterbackKick(frame);
        $handleOffensiveIllegalTouching(frame);
        $handleDefensiveTouching(frame);
        $handleQuarterbackCrossedLine(frame);
        $handleQuarterbackOutOfBounds(frame);
        $handleQuarterbackSacked(frame);
    }

    return { run, command };
}
