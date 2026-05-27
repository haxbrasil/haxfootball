import { COLOR } from "@common/general/color";
import {
    getDistance,
    getPointDistance,
    getPointSegmentDistance,
    getSpeed,
} from "@common/math/geometry";
import type {
    GameState,
    GameStateDisc,
    GameStatePlayer,
} from "@runtime/engine";
import { Team } from "@runtime/models";
import { $effect } from "@runtime/runtime";
import { t } from "@lingui/core/macro";
import {
    TRAINING_BALL_COLOR,
    TRAINING_BALL_DAMPING,
    TRAINING_BALL_DISC_IDS,
    TRAINING_BALL_INV_MASS,
    TRAINING_BLUE_TARGET_COLOR,
    TRAINING_HIDDEN_DISC,
    TRAINING_LANE_BALL_DISC_NAMES,
    TRAINING_PLAYER_MOVEABLE_INV_MASS,
    TRAINING_READY_BALL_BCOEF,
    TRAINING_RED_TARGET_COLOR,
    TRAINING_TARGET_BCOEF,
    TRAINING_TARGET_DAMPING,
    TRAINING_TARGET_DISC_IDS,
    TRAINING_TARGET_DISC_NAMES,
    TRAINING_TARGET_GROUP,
    TRAINING_TARGET_INV_MASS,
} from "../stadium";
import {
    createTargetPlacements,
    getOutsideTrainingPosition,
    getPlayerSpawnForTargetPlacements,
    isInsideAnyTrainingLane,
    isInsideTrainingLane,
    TRAINING_LANES,
    TRAINING_PRE_KICK_DRAG_LIMIT,
    TRAINING_STOP_SPEED,
    TRAINING_STOP_TICKS,
    TRAINING_TARGET_COUNT,
    TRAINING_TARGET_RADIUS,
    type TrainingLane,
    type TrainingTargetPlacement,
} from "../shared/geometry";

type LaneRuntime = {
    competitorId: number | null;
    competitorTeam: Team.RED | Team.BLUE | null;
    activeTargets: boolean[];
    placements: TrainingTargetPlacement[];
    inFlight: boolean;
    kickedAtTick: number | null;
    inputBlockedUntilTick: number | null;
    pendingMissUntilTick: number | null;
    stoppedTicks: number;
    previousBall: GameStateDisc | null;
};

const KICK_SPEED_THRESHOLD = 1.2;
const KICK_SPEED_INCREASE_THRESHOLD = 0.7;
const KICK_DISTANCE_BUFFER = 8;
const INPUT_BLOCK_TICKS = 30;
const MISS_CONFIRMATION_TICKS = 3;
const TARGET_HIT_SPEED_THRESHOLD = 0.05;
const TARGET_HIT_DISPLACEMENT_THRESHOLD = 1;

const createLaneRuntime = (): LaneRuntime => ({
    competitorId: null,
    competitorTeam: null,
    activeTargets: Array.from({ length: TRAINING_TARGET_COUNT }, () => false),
    placements: [],
    inFlight: false,
    kickedAtTick: null,
    inputBlockedUntilTick: null,
    pendingMissUntilTick: null,
    stoppedTicks: 0,
    previousBall: null,
});

const getTargetColor = (team: Team.RED | Team.BLUE): number =>
    team === Team.RED ? TRAINING_RED_TARGET_COLOR : TRAINING_BLUE_TARGET_COLOR;

function getLaneBall(
    state: GameState,
    laneIndex: number,
): GameStateDisc | null {
    const discName = TRAINING_LANE_BALL_DISC_NAMES[laneIndex];

    return discName === undefined ? null : (state.discs[discName] ?? null);
}

function getLaneTarget(
    state: GameState,
    laneIndex: number,
    targetIndex: number,
): GameStateDisc | null {
    const discName = TRAINING_TARGET_DISC_NAMES[laneIndex]?.[targetIndex];

    return discName === undefined ? null : (state.discs[discName] ?? null);
}

function targetWasHit({
    ball,
    placement,
    previousBall,
    target,
}: {
    ball: GameStateDisc;
    placement: TrainingTargetPlacement;
    previousBall: GameStateDisc | null;
    target: GameStateDisc;
}): boolean {
    if (previousBall) {
        const hitDistance = ball.radius + placement.radius;

        if (
            getPointSegmentDistance(placement, previousBall, ball) <=
            hitDistance
        ) {
            return true;
        }
    }

    return (
        getSpeed(target) > TARGET_HIT_SPEED_THRESHOLD ||
        getPointDistance(target, placement) > TARGET_HIT_DISPLACEMENT_THRESHOLD
    );
}

function detectKick({
    ball,
    previousBall,
    player,
}: {
    ball: GameStateDisc;
    previousBall: GameStateDisc | null;
    player: GameStatePlayer;
}): boolean {
    if (!previousBall) return false;

    const speed = getSpeed(ball);
    const previousSpeed = getSpeed(previousBall);
    const wasCloseToBall =
        getDistance(player, previousBall) <= KICK_DISTANCE_BUFFER;

    return (
        wasCloseToBall &&
        speed >= KICK_SPEED_THRESHOLD &&
        speed - previousSpeed >= KICK_SPEED_INCREASE_THRESHOLD
    );
}

function getClearedTargetCount(lane: LaneRuntime): number {
    return lane.activeTargets.filter((active) => !active).length;
}

function getRemainingTargetCount(lane: LaneRuntime): number {
    return lane.activeTargets.filter(Boolean).length;
}

function resetLaneRuntime(laneState: LaneRuntime): void {
    laneState.activeTargets = Array.from(
        { length: TRAINING_TARGET_COUNT },
        () => true,
    );
    laneState.inFlight = false;
    laneState.kickedAtTick = null;
    laneState.pendingMissUntilTick = null;
    laneState.stoppedTicks = 0;
    laneState.previousBall = null;
}

function blockLaneInput(laneState: LaneRuntime, tickNumber: number): void {
    laneState.inputBlockedUntilTick = tickNumber + INPUT_BLOCK_TICKS;
}

function isLaneInputBlocked(
    laneState: LaneRuntime,
    tickNumber: number,
): boolean {
    if (laneState.inputBlockedUntilTick === null) return false;

    if (tickNumber >= laneState.inputBlockedUntilTick) {
        laneState.inputBlockedUntilTick = null;
        return false;
    }

    return true;
}

export function Training() {
    const lanes = TRAINING_LANES.map((lane) => ({
        lane,
        state: createLaneRuntime(),
    }));

    $effect(($) => {
        $.setDiscProperties(0, {
            x: 0,
            y: 0,
            radius: 0,
            cMask: 0,
            cGroup: 0,
            color: -1,
            xspeed: 0,
            yspeed: 0,
        });
    });

    function $hideLane(laneIndex: number) {
        const ballId = TRAINING_BALL_DISC_IDS[laneIndex];
        const targetIds = TRAINING_TARGET_DISC_IDS[laneIndex];

        $effect(($) => {
            if (ballId !== undefined) {
                $.setDiscProperties(ballId, {
                    x: TRAINING_LANES[laneIndex]?.ball.x ?? 0,
                    y: TRAINING_LANES[laneIndex]?.ball.y ?? 0,
                    ...TRAINING_HIDDEN_DISC,
                });
            }

            targetIds?.forEach((targetId) => {
                $.setDiscProperties(targetId, TRAINING_HIDDEN_DISC);
            });
        });
    }

    function $resetLane({
        lane,
        laneIndex,
        laneState,
        player,
        announce,
    }: {
        lane: TrainingLane;
        laneIndex: number;
        laneState: LaneRuntime;
        player: GameStatePlayer;
        announce: "assignment" | "miss" | "replacement" | null;
    }) {
        const ballId = TRAINING_BALL_DISC_IDS[laneIndex];
        const targetIds = TRAINING_TARGET_DISC_IDS[laneIndex];
        const placements = createTargetPlacements(lane);
        const playerSpawn = getPlayerSpawnForTargetPlacements(lane, placements);
        laneState.placements = placements;
        resetLaneRuntime(laneState);

        $effect(($) => {
            const cf = $.CollisionFlags;

            if (ballId !== undefined) {
                $.setDiscProperties(ballId, {
                    x: lane.ball.x,
                    y: lane.ball.y,
                    radius: 7.85,
                    bCoeff: TRAINING_READY_BALL_BCOEF,
                    invMass: TRAINING_BALL_INV_MASS,
                    damping: TRAINING_BALL_DAMPING,
                    xspeed: 0,
                    yspeed: 0,
                    color: TRAINING_BALL_COLOR,
                    cGroup: cf.ball | cf.kick,
                    cMask: cf.red | cf.blue | cf[TRAINING_TARGET_GROUP],
                });
            }

            $.fakeSendPlayerInput(0, player.id);
            $.setPlayerDiscProperties(player.id, {
                x: playerSpawn.x,
                y: playerSpawn.y,
                invMass: TRAINING_PLAYER_MOVEABLE_INV_MASS,
                xspeed: 0,
                yspeed: 0,
            });

            targetIds?.forEach((targetId, targetIndex) => {
                const placement = placements[targetIndex];
                if (!placement) return;

                $.setDiscProperties(targetId, {
                    x: placement.x,
                    y: placement.y,
                    radius: TRAINING_TARGET_RADIUS,
                    bCoeff: TRAINING_TARGET_BCOEF,
                    invMass: TRAINING_TARGET_INV_MASS,
                    damping: TRAINING_TARGET_DAMPING,
                    xspeed: 0,
                    yspeed: 0,
                    color: getTargetColor(player.team),
                    cGroup: cf[TRAINING_TARGET_GROUP],
                    cMask: cf.ball,
                });
            });

            if (announce === "assignment") {
                $.send({
                    message: t`🎯 Training lane ready. Clear all 10 targets before everyone else.`,
                    color: COLOR.ACTION,
                    to: player.id,
                    sound: "notification",
                });
            }

            if (announce === "replacement") {
                $.send({
                    message: t`🎯 ${player.name} enters an open Training lane.`,
                    color: COLOR.ACTION,
                    sound: "notification",
                });
            }

            if (announce === "miss") {
                $.send({
                    message: t`↩️ Miss. Your lane reset to 10 targets.`,
                    color: COLOR.WARNING,
                    to: player.id,
                    sound: "notification",
                });
            }
        });
    }

    function $resetBallAndPlayer({
        lane,
        laneIndex,
        laneState,
        player,
    }: {
        lane: TrainingLane;
        laneIndex: number;
        laneState: LaneRuntime;
        player: GameStatePlayer;
    }) {
        const ballId = TRAINING_BALL_DISC_IDS[laneIndex];
        const playerSpawn = getPlayerSpawnForTargetPlacements(
            lane,
            laneState.placements,
            laneState.activeTargets,
        );

        laneState.inFlight = false;
        laneState.kickedAtTick = null;
        laneState.pendingMissUntilTick = null;
        laneState.stoppedTicks = 0;
        laneState.previousBall = null;

        $effect(($) => {
            const cf = $.CollisionFlags;

            if (ballId !== undefined) {
                $.setDiscProperties(ballId, {
                    x: lane.ball.x,
                    y: lane.ball.y,
                    radius: 7.85,
                    bCoeff: TRAINING_READY_BALL_BCOEF,
                    invMass: TRAINING_BALL_INV_MASS,
                    damping: TRAINING_BALL_DAMPING,
                    xspeed: 0,
                    yspeed: 0,
                    color: TRAINING_BALL_COLOR,
                    cGroup: cf.ball | cf.kick,
                    cMask: cf.red | cf.blue | cf[TRAINING_TARGET_GROUP],
                });
            }

            $.fakeSendPlayerInput(0, player.id);
            $.setPlayerDiscProperties(player.id, {
                x: playerSpawn.x,
                y: playerSpawn.y,
                invMass: TRAINING_PLAYER_MOVEABLE_INV_MASS,
                xspeed: 0,
                yspeed: 0,
            });
        });
    }

    function $handleAssignments(state: GameState) {
        const competitors = state.players.slice(0, TRAINING_LANES.length);
        const competitorIds = new Set(competitors.map((player) => player.id));
        const extras = state.players.filter(
            (player) => !competitorIds.has(player.id),
        );

        lanes.forEach(({ lane, state: laneState }, laneIndex) => {
            const player = competitors[laneIndex] ?? null;
            const previousCompetitorId = laneState.competitorId;
            const previousTeam = laneState.competitorTeam;

            if (!player) {
                if (previousCompetitorId !== null) {
                    laneState.competitorId = null;
                    laneState.competitorTeam = null;
                    laneState.inputBlockedUntilTick = null;
                    resetLaneRuntime(laneState);
                    laneState.activeTargets = Array.from(
                        { length: TRAINING_TARGET_COUNT },
                        () => false,
                    );
                    $hideLane(laneIndex);
                }
                return;
            }

            const changedPlayer = previousCompetitorId !== player.id;
            const changedTeam = previousTeam !== player.team;

            if (changedPlayer || changedTeam) {
                laneState.competitorId = player.id;
                laneState.competitorTeam = player.team;
                laneState.inputBlockedUntilTick = null;
                $resetLane({
                    lane,
                    laneIndex,
                    laneState,
                    player,
                    announce:
                        previousCompetitorId === null
                            ? "assignment"
                            : "replacement",
                });
            }
        });

        $effect(($) => {
            extras.forEach((player, extraIndex) => {
                if (!isInsideAnyTrainingLane(player)) return;

                const position = getOutsideTrainingPosition(extraIndex);
                $.setPlayerDiscProperties(player.id, {
                    x: position.x,
                    y: position.y,
                    xspeed: 0,
                    yspeed: 0,
                });
            });
        });
    }

    function $handleTargetHit({
        lane,
        laneIndex,
        laneState,
        player,
        targetIndex,
        tickNumber,
    }: {
        lane: TrainingLane;
        laneIndex: number;
        laneState: LaneRuntime;
        player: GameStatePlayer;
        targetIndex: number;
        tickNumber: number;
    }) {
        laneState.activeTargets[targetIndex] = false;

        const clearedTargets = getClearedTargetCount(laneState);
        const remainingTargets = getRemainingTargetCount(laneState);

        if (remainingTargets === 0) {
            $effect(($) => {
                $.send({
                    message: t`🏆 ${player.name} cleared all 10 Training targets first!`,
                    color: COLOR.SUCCESS,
                    style: "bold",
                    sound: "notification",
                });
                $.stopGame();
            });
            return;
        }

        blockLaneInput(laneState, tickNumber);
        $resetBallAndPlayer({ lane, laneIndex, laneState, player });

        $effect(($) => {
            $.send({
                message: t`✅ Hit! ${clearedTargets}/10 targets cleared.`,
                color: COLOR.SUCCESS,
                to: player.id,
                sound: "notification",
            });
        });
    }

    function $blockPlayerInput(playerId: number) {
        $effect(($) => {
            $.fakeSendPlayerInput(0, playerId);
            $.setPlayerDiscProperties(playerId, {
                xspeed: 0,
                yspeed: 0,
            });
        });
    }

    function $handleLaneRun({
        lane,
        laneIndex,
        laneState,
        player,
        ball,
        state,
        tickNumber,
    }: {
        lane: TrainingLane;
        laneIndex: number;
        laneState: LaneRuntime;
        player: GameStatePlayer;
        ball: GameStateDisc;
        state: GameState;
        tickNumber: number;
    }) {
        const previousBall = laneState.previousBall;
        const kicked =
            !laneState.inFlight && detectKick({ ball, previousBall, player });

        if (kicked) {
            laneState.inFlight = true;
            laneState.kickedAtTick = tickNumber;
            laneState.pendingMissUntilTick = null;
            laneState.stoppedTicks = 0;
        }

        if (!laneState.inFlight) {
            const dragDistance = getPointDistance(ball, lane.ball);

            if (dragDistance > TRAINING_PRE_KICK_DRAG_LIMIT) {
                blockLaneInput(laneState, tickNumber);
                $resetLane({
                    lane,
                    laneIndex,
                    laneState,
                    player,
                    announce: "miss",
                });
                return;
            }

            laneState.previousBall = ball;
            return;
        }

        const targetIndex = laneState.activeTargets.findIndex(
            (active, index) => {
                if (!active) return false;
                const placement = laneState.placements[index];
                const target = getLaneTarget(state, laneIndex, index);
                if (!placement || !target) return false;

                return targetWasHit({
                    ball,
                    placement,
                    previousBall,
                    target,
                });
            },
        );

        if (targetIndex >= 0) {
            $handleTargetHit({
                lane,
                laneIndex,
                laneState,
                player,
                targetIndex,
                tickNumber,
            });
            return;
        }

        const confirmMiss = () => {
            if (laneState.pendingMissUntilTick === null) {
                laneState.pendingMissUntilTick =
                    tickNumber + MISS_CONFIRMATION_TICKS;
                laneState.previousBall = ball;
                return false;
            }

            return tickNumber >= laneState.pendingMissUntilTick;
        };

        if (!isInsideTrainingLane(lane, ball)) {
            if (!confirmMiss()) return;
            blockLaneInput(laneState, tickNumber);
            $resetLane({
                lane,
                laneIndex,
                laneState,
                player,
                announce: "miss",
            });
            return;
        }

        if (getSpeed(ball) <= TRAINING_STOP_SPEED) {
            laneState.stoppedTicks += 1;
        } else {
            laneState.stoppedTicks = 0;
        }

        if (laneState.stoppedTicks >= TRAINING_STOP_TICKS) {
            if (!confirmMiss()) return;
            blockLaneInput(laneState, tickNumber);
            $resetLane({
                lane,
                laneIndex,
                laneState,
                player,
                announce: "miss",
            });
            return;
        }

        laneState.pendingMissUntilTick = null;
        laneState.previousBall = ball;
    }

    function run(state: GameState) {
        $handleAssignments(state);

        lanes.forEach(({ lane, state: laneState }, laneIndex) => {
            if (laneState.competitorId === null) return;

            const player = state.players.find(
                (candidate) => candidate.id === laneState.competitorId,
            );
            const ball = getLaneBall(state, laneIndex);

            if (!player || !ball) return;

            if (isLaneInputBlocked(laneState, state.tickNumber)) {
                $blockPlayerInput(player.id);
                return;
            }

            $handleLaneRun({
                lane,
                laneIndex,
                laneState,
                player,
                ball,
                state,
                tickNumber: state.tickNumber,
            });
        });
    }

    return { run };
}
