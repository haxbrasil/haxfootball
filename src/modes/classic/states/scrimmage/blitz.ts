import type { GameState, GameStatePlayer } from "@runtime/engine";
import {
    $config,
    $dispose,
    $effect,
    $global,
    $next,
    $event,
} from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { AVATARS, findCatchers, opposite } from "@common/game/game";
import {
    advanceDownState,
    DownState,
    incrementDownState,
    processDownEvent,
    processDownEventIncrement,
    withLastBallY,
} from "@modes/classic/shared/rules/down";
import { cn, formatNames } from "@modes/classic/shared/presentation/message";
import { formatSafetyScoreMessage } from "@modes/classic/shared/rules/safety";
import {
    calculateYardsGained,
    calculateDirectionalGain,
    getFieldPosition,
    getPositionFromFieldPosition,
    isInMainField,
    isOutOfBounds,
} from "@modes/classic/shared/field";
import { t } from "@lingui/core/macro";
import { $createSharedCommandHandler } from "@modes/classic/shared/commands";
import { findEligibleBallCatchers } from "@modes/classic/shared/interaction/reception";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@modes/classic/hooks/game";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";
import { SCORES } from "@modes/classic/shared/rules/scoring";
import { Stat } from "@modes/classic/stats";
import type { Config } from "@modes/classic/config";

type Frame = {
    state: GameState;
    quarterback: GameStatePlayer;
    defenders: GameStatePlayer[];
    quarterbackCrossedLineOfScrimmage: boolean;
    ballBeyondLineOfScrimmage: boolean;
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
    const config = $config<Config>();
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
        const ballBeyondLineOfScrimmage =
            calculateDirectionalGain(
                offensiveTeam,
                state.ball.x - lineOfScrimmageX,
            ) > 0;

        return {
            state,
            quarterback,
            defenders,
            quarterbackCrossedLineOfScrimmage,
            ballBeyondLineOfScrimmage,
        };
    }

    function $handleQuarterbackKick(frame: Frame) {
        if (ballIsDead || !frame.quarterback.isKickingBall) return;

        $event({
            type: Stat.PassAttempt,
            playerId: quarterbackId,
            value: {
                team: offensiveTeam,
                down: downState.downAndDistance.down,
                distance: downState.downAndDistance.distance,
                startFieldPosition: downState.fieldPos,
            },
        });

        $next({
            to: "SNAP_IN_FLIGHT",
            params: {
                downState,
                passerId: quarterbackId,
            },
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
        const downIncrement = incrementDownState(downState);

        offensiveTouchers.forEach((player) => {
            $event({
                type: Stat.Foul,
                playerId: player.id,
                value: {
                    team: offensiveTeam,
                    down: downState.downAndDistance.down,
                    distance: downState.downAndDistance.distance,
                    startFieldPosition: downState.fieldPos,
                    yards: 0,
                },
            });
        });

        processDownEventIncrement({
            event: downIncrement.event,
            onNextDown() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            downIncrement.downState,
                            t`Illegal touch by ${offenderNames}`,
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
                            downIncrement.downState,
                            t`Illegal touch by ${offenderNames}`,
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
                downState: downIncrement.downState,
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

    function $penalizeIllegalQuarterbackAdvance(): never {
        const downIncrement = incrementDownState(downState);

        $event({
            type: Stat.Foul,
            playerId: quarterbackId,
            value: {
                team: offensiveTeam,
                down: downState.downAndDistance.down,
                distance: downState.downAndDistance.distance,
                startFieldPosition: downState.fieldPos,
                yards: 0,
            },
        });

        $setBallInactive();

        $effect(($) => {
            $.setAvatar(quarterbackId, AVATARS.CLOWN);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(quarterbackId, null);
            });

            $setBallActive();
        });

        processDownEventIncrement({
            event: downIncrement.event,
            onNextDown() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            downIncrement.downState,
                            t`illegal advance beyond the LOS`,
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
                            downIncrement.downState,
                            t`illegal advance beyond the LOS`,
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
                downState: downIncrement.downState,
            },
            wait: ticks({ seconds: 1 }),
        });
    }

    function $handleIllegalQuarterbackAdvance(frame: Frame) {
        if (ballIsDead || frame.quarterback.isKickingBall) return;
        if (!frame.ballBeyondLineOfScrimmage) return;
        if (frame.quarterbackCrossedLineOfScrimmage) return;

        $penalizeIllegalQuarterbackAdvance();
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
            const yards = calculateYardsGained(
                offensiveTeam,
                downState.fieldPos,
                fieldPos,
            );

            $event({
                type: Stat.QuarterbackCarry,
                playerId: quarterbackId,
                value: {
                    team: offensiveTeam,
                    down: downState.downAndDistance.down,
                    distance: downState.downAndDistance.distance,
                    startFieldPosition: downState.fieldPos,
                    endFieldPosition: fieldPos,
                    yards,
                },
            });

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
                $.setAvatar(quarterbackId, yards < 0 ? AVATARS.CANCEL : null);
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
                        formatSafetyScoreMessage(config.flags.timeouts),
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
        const sackYards = Math.max(
            0,
            -calculateYardsGained(offensiveTeam, downState.fieldPos, fieldPos),
        );

        $event({
            type: Stat.SackTaken,
            playerId: quarterbackId,
            value: {
                team: offensiveTeam,
                down: downState.downAndDistance.down,
                distance: downState.downAndDistance.distance,
                startFieldPosition: downState.fieldPos,
                endFieldPosition: fieldPos,
                yards: sackYards,
                sackers: catchers.map((player) => player.id),
            },
        });
        catchers.forEach((player) => {
            $event({
                type: Stat.Sack,
                playerId: player.id,
                value: {
                    team: opposite(offensiveTeam),
                    down: downState.downAndDistance.down,
                    distance: downState.downAndDistance.distance,
                    startFieldPosition: downState.fieldPos,
                    endFieldPosition: fieldPos,
                    yards: sackYards,
                    sacked: quarterbackId,
                },
            });
            $event({
                type: Stat.Tackle,
                playerId: player.id,
                value: {
                    team: opposite(offensiveTeam),
                    down: downState.downAndDistance.down,
                    distance: downState.downAndDistance.distance,
                    startFieldPosition: downState.fieldPos,
                    endFieldPosition: fieldPos,
                    tackled: quarterbackId,
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
            $.setAvatar(quarterbackId, sackYards > 0 ? AVATARS.CANCEL : null);

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
        $handleIllegalQuarterbackAdvance(frame);
        $handleQuarterbackCrossedLine(frame);
        $handleQuarterbackOutOfBounds(frame);
        $handleQuarterbackSacked(frame);
    }

    return { run, command };
}
