import type { GameState, GameStatePlayer } from "@runtime/engine";
import { ticks } from "@common/general/time";
import { AVATARS, setPlayerAvatars } from "@common/game/game";
import { $setBallMoveable, $unlockBall } from "@meta/legacy/hooks/physics";
import {
    $hideCrowdingBoxes,
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $showCrowdingBoxes,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { DownState } from "@meta/legacy/shared/down";
import { cn, formatNames } from "@meta/legacy/shared/message";
import {
    applyDefensivePenalty,
    applyOffensivePenalty,
    processDefensivePenaltyEvent,
    processOffensivePenalty,
} from "@meta/legacy/shared/penalty";
import { SCORES } from "@meta/legacy/shared/scoring";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import {
    calculateDirectionalGain,
    getPositionFromFieldPosition,
    isBallOutOfBounds,
} from "@meta/legacy/shared/stadium";
import { $global } from "@meta/legacy/hooks/global";
import { t } from "@lingui/core/macro";
import { unique } from "@common/general/helpers";
import * as Crowding from "@meta/legacy/shared/crowding";
import assert from "assert";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import {
    findEligibleBallCatchers,
    findEligibleCatchers,
} from "@meta/legacy/shared/reception";
import {
    BLITZ_BASE_DELAY_TICKS,
    BLITZ_EARLY_DELAY_TICKS,
    BLITZ_EARLY_NOTICE_DELAY_TICKS,
    BLITZ_EARLY_NOTICE_REMAINING_SECONDS,
    BLITZ_EARLY_MOVE_THRESHOLD_PX,
} from "@meta/legacy/shared/blitz";
import {
    DEFAULT_PUSHING_CONTACT_DISTANCE,
    DEFAULT_PUSHING_MIN_BACKFIELD_STEP,
    detectPushingFoul,
} from "@meta/legacy/shared/pushing";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";

type Frame = {
    state: GameState;
    previousState: GameState;
    lineOfScrimmageX: number;
    quarterback: GameStatePlayer;
    defenders: GameStatePlayer[];
    offensivePlayers: GameStatePlayer[];
    offsideDefender: GameStatePlayer | undefined;
    defenseCrossedLineOfScrimmage: boolean;
    quarterbackCrossedLineOfScrimmage: boolean;
    ballBeyondLineOfScrimmage: boolean;
    ballBehindLineOfScrimmage: boolean;
    isBlitzAllowed: boolean;
    nextBallMoveTick?: number | undefined;
    shouldAnnounceEarlyBlitzNotice: boolean;
};

const DEFENSIVE_OFFSIDE_PENALTY_YARDS = 5;
const DEFENSIVE_TOUCHING_PENALTY_YARDS = 5;
const OFFENSIVE_FOUL_PENALTY_YARDS = 5;

export function Snap({
    quarterbackId,
    downState,
    crowdingData = { outer: [], inner: [] },
    ballMovedAt,
}: {
    quarterbackId: number;
    downState: DownState;
    crowdingData?: Crowding.CrowdingData;
    ballMovedAt?: number;
}) {
    const { fieldPos, offensiveTeam, downAndDistance } = downState;

    const beforeState = $before();
    const downStartTick = beforeState.tickNumber;
    const defaultBlitzAllowedTick = downStartTick + BLITZ_BASE_DELAY_TICKS;
    const ballSpawnPosition = {
        x: beforeState.ball.x,
        y: beforeState.ball.y,
    };

    const isBallBeyondMoveThreshold = (ball: { x: number; y: number }) =>
        Math.hypot(ball.x - ballSpawnPosition.x, ball.y - ballSpawnPosition.y) >
        BLITZ_EARLY_MOVE_THRESHOLD_PX;

    $setBallMoveable();
    $unlockBall();
    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);

    $dispose(() => {
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $hideCrowdingBoxes();
    });

    function buildFrame(state: GameState): Frame | null {
        const previousState = $before();
        const quarterback = state.players.find((p) => p.id === quarterbackId);
        if (!quarterback) return null;

        const shouldRecordBallMoveTick =
            !quarterback.isKickingBall &&
            ballMovedAt === undefined &&
            state.tickNumber < defaultBlitzAllowedTick;

        const didBallExceedMoveThreshold =
            shouldRecordBallMoveTick && isBallBeyondMoveThreshold(state.ball);

        const nextBallMoveTick = didBallExceedMoveThreshold
            ? state.tickNumber
            : ballMovedAt;

        const blitzAllowedTick =
            nextBallMoveTick === undefined
                ? defaultBlitzAllowedTick
                : Math.min(
                      defaultBlitzAllowedTick,
                      nextBallMoveTick + BLITZ_EARLY_DELAY_TICKS,
                  );

        const isBlitzAllowed = state.tickNumber >= blitzAllowedTick;

        const earlyBlitzAllowedTick =
            nextBallMoveTick === undefined
                ? undefined
                : nextBallMoveTick + BLITZ_EARLY_DELAY_TICKS;
        const earlyBlitzNoticeTick =
            nextBallMoveTick === undefined
                ? undefined
                : nextBallMoveTick + BLITZ_EARLY_NOTICE_DELAY_TICKS;
        const shouldAnnounceEarlyBlitzNotice =
            earlyBlitzAllowedTick !== undefined &&
            earlyBlitzAllowedTick < defaultBlitzAllowedTick &&
            earlyBlitzNoticeTick !== undefined &&
            state.tickNumber === earlyBlitzNoticeTick;

        const lineOfScrimmageX = getPositionFromFieldPosition(fieldPos);

        const defenders = state.players.filter(
            (player) => player.team !== offensiveTeam,
        );

        const offensivePlayers = state.players.filter(
            (player) =>
                player.team === offensiveTeam && player.id !== quarterbackId,
        );

        const offsideDefender = defenders.find(
            (player) =>
                calculateDirectionalGain(
                    offensiveTeam,
                    player.x - lineOfScrimmageX,
                ) < 0,
        );
        const defenseCrossedLineOfScrimmage = !!offsideDefender;

        const quarterbackCrossedLineOfScrimmage =
            calculateDirectionalGain(
                offensiveTeam,
                quarterback.x - lineOfScrimmageX,
            ) > 0;

        const ballDirectionalGain = calculateDirectionalGain(
            offensiveTeam,
            state.ball.x - lineOfScrimmageX,
        );
        const ballBeyondLineOfScrimmage = ballDirectionalGain > 0;
        const ballBehindLineOfScrimmage = ballDirectionalGain < 0;

        return {
            state,
            previousState,
            lineOfScrimmageX,
            quarterback,
            defenders,
            offensivePlayers,
            offsideDefender,
            defenseCrossedLineOfScrimmage,
            quarterbackCrossedLineOfScrimmage,
            ballBeyondLineOfScrimmage,
            ballBehindLineOfScrimmage,
            isBlitzAllowed,
            nextBallMoveTick,
            shouldAnnounceEarlyBlitzNotice,
        };
    }

    function $handlePushingFoul(frame: Frame) {
        const pushing = detectPushingFoul({
            currentPlayers: frame.state.players,
            previousPlayers: frame.previousState.players,
            offensiveTeam,
            quarterbackId,
            lineOfScrimmageX: frame.lineOfScrimmageX,
            isBlitzAllowed: frame.isBlitzAllowed,
            pushingContactDistance: DEFAULT_PUSHING_CONTACT_DISTANCE,
            minBackfieldStep: DEFAULT_PUSHING_MIN_BACKFIELD_STEP,
        });

        if (!pushing) return;

        const penaltyResult = applyOffensivePenalty(
            downState,
            -OFFENSIVE_FOUL_PENALTY_YARDS,
        );
        const offenderNames = formatNames(pushing.pushers);
        const pusherIds = pushing.pushers.map((player) => player.id);

        $setBallInactive();

        $effect(($) => {
            setPlayerAvatars(pusherIds, $.setAvatar, AVATARS.CLOWN);
        });

        $dispose(() => {
            $effect(($) => {
                setPlayerAvatars(pusherIds, $.setAvatar, null);
            });

            $setBallActive();
        });

        processOffensivePenalty({
            event: penaltyResult.event,
            onNextDown() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            penaltyResult.downState,
                            t`Pushing foul by ${offenderNames}`,
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
                            t`pushing foul by ${offenderNames}`,
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
            wait: ticks({ seconds: 1 }),
        });
    }

    function $registerSnapProfile(players: GameStatePlayer[]) {
        players.forEach((player) => {
            $global((state) => state.updateSnapProfile(player.id, player));
        });
    }

    function $handleDefensiveOffside(frame: Frame) {
        if (frame.isBlitzAllowed || !frame.defenseCrossedLineOfScrimmage) {
            return;
        }

        const penaltyResult = applyDefensivePenalty(
            downState,
            DEFENSIVE_OFFSIDE_PENALTY_YARDS,
        );

        const offsideDefenderId = frame.offsideDefender?.id;

        assert(
            offsideDefenderId,
            "Offside defender must exist for defensive offside penalty",
        );

        $setBallInactive();

        $effect(($) => {
            $.setAvatar(offsideDefenderId, AVATARS.CLOWN);
        });

        $dispose(() => {
            $setBallActive();

            $effect(($) => {
                $.setAvatar(offsideDefenderId, null);
            });
        });

        processDefensivePenaltyEvent({
            event: penaltyResult.event,
            onSameDown() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            penaltyResult.downState,
                            t`defensive offside`,
                            t`${DEFENSIVE_OFFSIDE_PENALTY_YARDS}-yard penalty.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });

                $next({
                    to: "PRESNAP",
                    params: {
                        downState: penaltyResult.downState,
                    },
                    wait: ticks({ seconds: 1 }),
                });
            },
            onFirstDown() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            penaltyResult.downState,
                            t`defensive offside`,
                            t`${DEFENSIVE_OFFSIDE_PENALTY_YARDS}-yard penalty`,
                            t`automatic first down.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });

                $next({
                    to: "PRESNAP",
                    params: {
                        downState: penaltyResult.downState,
                    },
                    wait: ticks({ seconds: 1 }),
                });
            },
            onTouchdown() {
                $global((state) =>
                    state.incrementScore(offensiveTeam, SCORES.TOUCHDOWN),
                );

                const { scores } = $global();

                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            scores,
                            penaltyResult.downState,
                            t`defensive offside`,
                            t`${DEFENSIVE_OFFSIDE_PENALTY_YARDS}-yard penalty`,
                            t`automatic touchdown.`,
                        ),
                        color: COLOR.WARNING,
                        to: "mixed",
                        sound: "notification",
                        style: "bold",
                    });
                });

                $next({
                    to: "EXTRA_POINT",
                    params: {
                        offensiveTeam,
                    },
                    wait: ticks({ seconds: 3 }),
                });
            },
        });
    }

    function $getCrowdingResult(
        frame: Frame,
    ): Crowding.CrowdingEvaluation | null {
        if (frame.isBlitzAllowed) return null;

        return Crowding.evaluateCrowding({
            state: frame.state,
            quarterbackId,
            downState,
            crowdingData,
        });
    }

    function $handleCrowdingFoul(
        crowdingResult: Crowding.CrowdingEvaluation | null,
    ) {
        if (!crowdingResult || !crowdingResult.hasFoul) return;

        const penaltyResult = applyDefensivePenalty(
            downState,
            Crowding.CROWDING_PENALTY_YARDS,
        );

        const crowdingOffenderNames = Crowding.getCrowdingOffenderNames(
            crowdingResult.foulInfo,
        );

        const crowdingOffenderIds = unique(
            crowdingResult.foulInfo.contributions
                .filter((entry) => entry.weightedTicks > 0)
                .map((entry) => entry.playerId),
        );

        $showCrowdingBoxes(offensiveTeam, fieldPos);

        $dispose(() => {
            $hideCrowdingBoxes();
        });

        processDefensivePenaltyEvent({
            event: penaltyResult.event,
            onSameDown() {
                $effect(($) => {
                    $.pauseGame(true);
                    $.pauseGame(false);
                    $.send({
                        message: cn(
                            "❌",
                            penaltyResult.downState,
                            t`Crowd abuse by ${crowdingOffenderNames}`,
                            t`${Crowding.CROWDING_PENALTY_YARDS}-yard penalty.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });
                $next({
                    to: "PRESNAP",
                    params: { downState: penaltyResult.downState },
                    disposal: "AFTER_RESUME",
                });
            },
            onFirstDown() {
                $effect(($) => {
                    $.pauseGame(true);
                    $.pauseGame(false);
                    $.send({
                        message: cn(
                            "❌",
                            penaltyResult.downState,
                            t`crowd abuse by ${crowdingOffenderNames}`,
                            t`${Crowding.CROWDING_PENALTY_YARDS}-yard penalty`,
                            t`automatic first down.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });
                $next({
                    to: "PRESNAP",
                    params: { downState: penaltyResult.downState },
                    disposal: "AFTER_RESUME",
                });
            },
            onTouchdown() {
                $global((state) =>
                    state.incrementScore(offensiveTeam, SCORES.TOUCHDOWN),
                );

                const { scores } = $global();

                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            scores,
                            penaltyResult.downState,
                            t`crowd abuse by ${crowdingOffenderNames}`,
                            t`${Crowding.CROWDING_PENALTY_YARDS}-yard penalty`,
                            t`automatic touchdown.`,
                        ),
                        color: COLOR.WARNING,
                        to: "mixed",
                        sound: "notification",
                        style: "bold",
                    });

                    setPlayerAvatars(
                        crowdingOffenderIds,
                        $.setAvatar,
                        AVATARS.CLOWN,
                    );
                });

                $dispose(() => {
                    $effect(($) => {
                        setPlayerAvatars(
                            crowdingOffenderIds,
                            $.setAvatar,
                            null,
                        );
                    });
                });

                $next({
                    to: "EXTRA_POINT",
                    params: {
                        offensiveTeam,
                    },
                    wait: ticks({ seconds: 3 }),
                });
            },
        });
    }

    function $handleDefensiveTouching(frame: Frame) {
        const defensiveTouchers = findEligibleBallCatchers(
            frame.state.ball,
            frame.defenders,
        );

        if (defensiveTouchers.length === 0) return;

        const offenderNames = formatNames(defensiveTouchers);

        const penaltyResult = applyDefensivePenalty(
            downState,
            DEFENSIVE_TOUCHING_PENALTY_YARDS,
        );

        const defensiveToucherIds = defensiveTouchers.map(
            (player) => player.id,
        );

        $setBallInactive();

        $effect(($) => {
            setPlayerAvatars(defensiveToucherIds, $.setAvatar, AVATARS.CLOWN);
        });

        $dispose(() => {
            $effect(($) => {
                setPlayerAvatars(defensiveToucherIds, $.setAvatar, null);
            });

            $setBallActive();
        });

        processDefensivePenaltyEvent({
            event: penaltyResult.event,
            onSameDown() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            penaltyResult.downState,
                            t`defensive illegal touch by ${offenderNames}`,
                            t`${DEFENSIVE_TOUCHING_PENALTY_YARDS}-yard penalty.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });

                $next({
                    to: "PRESNAP",
                    params: {
                        downState: penaltyResult.downState,
                    },
                    wait: ticks({ seconds: 1 }),
                });
            },
            onFirstDown() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            penaltyResult.downState,
                            t`defensive illegal touch by ${offenderNames}`,
                            t`${DEFENSIVE_TOUCHING_PENALTY_YARDS}-yard penalty`,
                            t`automatic first down.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });

                $next({
                    to: "PRESNAP",
                    params: {
                        downState: penaltyResult.downState,
                    },
                    wait: ticks({ seconds: 1 }),
                });
            },
            onTouchdown() {
                $global((state) =>
                    state.incrementScore(offensiveTeam, SCORES.TOUCHDOWN),
                );

                const { scores } = $global();

                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            scores,
                            penaltyResult.downState,
                            t`defensive illegal touch by ${offenderNames}`,
                            t`${DEFENSIVE_TOUCHING_PENALTY_YARDS}-yard penalty`,
                            t`automatic touchdown.`,
                        ),
                        color: COLOR.WARNING,
                        to: "mixed",
                        sound: "notification",
                        style: "bold",
                    });
                });

                $next({
                    to: "EXTRA_POINT",
                    params: {
                        offensiveTeam,
                    },
                    wait: ticks({ seconds: 3 }),
                });
            },
        });
    }

    function $handleHandoff(frame: Frame) {
        if (frame.quarterback.isKickingBall) return;

        const offensiveTouchers = findEligibleCatchers(
            frame.quarterback,
            frame.offensivePlayers,
        );

        if (offensiveTouchers.length === 0 || !offensiveTouchers[0]) return;

        const runner = offensiveTouchers[0];

        $effect(($) => {
            $.send({
                message: t`🏃 ${runner.name} takes the handoff and starts a run!`,
                color: COLOR.ACTION,
            });
        });

        $next({
            to: "RUN",
            params: {
                playerId: runner.id,
                downState,
            },
        });
    }

    function $handleIllegalTouchingBehindLine(frame: Frame) {
        if (!frame.ballBehindLineOfScrimmage) return;

        const illegalTouchers = findEligibleBallCatchers(
            frame.state.ball,
            frame.offensivePlayers,
        );

        if (illegalTouchers.length === 0) return;

        const offenderNames = formatNames(illegalTouchers);

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
                            t`illegal touch by ${offenderNames}`,
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
                            t`illegal touch by ${offenderNames}`,
                            t`${OFFENSIVE_FOUL_PENALTY_YARDS}-yard penalty`,
                            t`turnover on downs.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });
            },
        });

        const illegalToucherIds = illegalTouchers.map((player) => player.id);

        $setBallInactive();

        $effect(($) => {
            setPlayerAvatars(illegalToucherIds, $.setAvatar, AVATARS.CLOWN);
        });

        $dispose(() => {
            $effect(($) => {
                setPlayerAvatars(illegalToucherIds, $.setAvatar, null);
            });

            $setBallActive();
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: penaltyResult.downState,
            },
            wait: ticks({ seconds: 1 }),
        });
    }

    function $handleBallOutOfBounds(frame: Frame) {
        if (frame.quarterback.isKickingBall) return;
        if (!isBallOutOfBounds(frame.state.ball)) return;

        const penaltyResult = applyOffensivePenalty(
            downState,
            -OFFENSIVE_FOUL_PENALTY_YARDS,
        );

        $setBallInactive();

        $dispose(() => {
            $setBallActive();
        });

        processOffensivePenalty({
            event: penaltyResult.event,
            onNextDown() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            penaltyResult.downState,
                            t`ball out of bounds`,
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
                            t`ball out of bounds`,
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
            wait: ticks({ seconds: 1 }),
        });
    }

    function $penalizeIllegalQuarterbackAdvance() {
        const penaltyResult = applyOffensivePenalty(
            downState,
            -OFFENSIVE_FOUL_PENALTY_YARDS,
        );

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

        processOffensivePenalty({
            event: penaltyResult.event,
            onNextDown() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            penaltyResult.downState,
                            t`illegal advance beyond the LOS`,
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
                            t`illegal advance beyond the LOS`,
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
            wait: ticks({ seconds: 1 }),
        });
    }

    function $handleBallBeyondLineOfScrimmage(frame: Frame) {
        if (frame.quarterback.isKickingBall) return;
        if (!frame.ballBeyondLineOfScrimmage) return;

        if (!frame.isBlitzAllowed) {
            $penalizeIllegalQuarterbackAdvance();
        }

        $effect(($) => {
            $.send({
                message: cn(t`🏃 Ball crossed the LOS`, t`QB run is live.`),
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

    function $handleQuarterbackBeyondLineOfScrimmage(frame: Frame) {
        if (frame.quarterback.isKickingBall) return;
        if (!frame.quarterbackCrossedLineOfScrimmage) return;

        if (!frame.isBlitzAllowed) {
            $penalizeIllegalQuarterbackAdvance();
        }

        $effect(($) => {
            $.send({
                message: cn(
                    t`🏃 QB crossed the LOS`,
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

    function $handleSnapKick(frame: Frame) {
        if (!frame.quarterback.isKickingBall) return;

        $next({
            to: "SNAP_IN_FLIGHT",
            params: { downState },
        });
    }

    function $handleEarlyBlitzNotice(frame: Frame) {
        if (!frame.shouldAnnounceEarlyBlitzNotice) return;

        $effect(($) => {
            $.send({
                message: t`⚡ Early blitz will be available in ${BLITZ_EARLY_NOTICE_REMAINING_SECONDS}s.`,
                color: COLOR.MUTED,
                sound: "none",
            });
        });
    }

    function $handleBlitz(frame: Frame) {
        if (!frame.isBlitzAllowed || !frame.defenseCrossedLineOfScrimmage) {
            return;
        }

        $effect(($) => {
            $.send({
                message: t`🚨 Defense is bringing the blitz!`,
                color: COLOR.CRITICAL,
            });
        });

        $next({
            to: "BLITZ",
            params: {
                downState,
                quarterbackId,
            },
        });
    }

    function $refreshSnapState(
        frame: Frame,
        crowdingResult: Crowding.CrowdingEvaluation | null,
    ) {
        const shouldRefreshSnapState =
            crowdingResult?.shouldUpdate ||
            frame.nextBallMoveTick !== ballMovedAt;

        if (!shouldRefreshSnapState) return;

        $next({
            to: "SNAP",
            params: {
                downState,
                quarterbackId,
                crowdingData: crowdingResult
                    ? crowdingResult.updatedCrowdingData
                    : crowdingData,
                ballMovedAt: frame.nextBallMoveTick,
            },
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

        $registerSnapProfile(frame.state.players);
        $handlePushingFoul(frame);
        $handleDefensiveOffside(frame);

        const crowdingResult = $getCrowdingResult(frame);

        $handleCrowdingFoul(crowdingResult);
        $handleDefensiveTouching(frame);
        $handleHandoff(frame);
        $handleIllegalTouchingBehindLine(frame);
        $handleBallOutOfBounds(frame);
        $handleBallBeyondLineOfScrimmage(frame);
        $handleQuarterbackBeyondLineOfScrimmage(frame);
        $handleEarlyBlitzNotice(frame);
        $handleSnapKick(frame);
        $handleBlitz(frame);
        $refreshSnapState(frame, crowdingResult);
    }

    return { run, command };
}
