import {
    getDistance,
    getPointDistance,
    isContainedInBounds,
    type Bounds,
    type PointLike,
} from "@common/math/geometry";
import { BALL_RADIUS } from "@modes/classic/stadium";
import { classicMapMeasures } from "@modes/classic/stadium";

export const TRAINING_LANE_COUNT = 3;
export const TRAINING_TARGET_COUNT = 10;
export const TRAINING_PLAYER_RADIUS = 15;
export const TRAINING_TARGET_RADIUS = TRAINING_PLAYER_RADIUS;
export const TRAINING_LANE_GAP = classicMapMeasures.YARD * 5;
export const TRAINING_MIN_TARGET_DISTANCE_FROM_BALL = 170;
export const TRAINING_TARGET_MIN_GAP = 45;
export const TRAINING_PRE_KICK_DRAG_LIMIT = 20;
export const TRAINING_STOP_SPEED = 0.08;
export const TRAINING_STOP_TICKS = 10;

export type TrainingLaneId = 0 | 1 | 2;

export type TrainingLane = {
    id: TrainingLaneId;
    name: string;
    ball: Position;
    playerSpawn: Position;
    bounds: Bounds;
};

export type TrainingTargetPlacement = Position & {
    radius: number;
};

const LANE_NAMES = ["left", "middle", "right"] as const;
const FIELD_TOP = classicMapMeasures.INNER_FIELD.topLeft.y;
const FIELD_BOTTOM = classicMapMeasures.INNER_FIELD.bottomRight.y;
export const TRAINING_LANE_HEIGHT = FIELD_BOTTOM - FIELD_TOP;
export const TRAINING_LANE_WIDTH = TRAINING_LANE_HEIGHT;
const TOTAL_WIDTH =
    TRAINING_LANE_COUNT * TRAINING_LANE_WIDTH +
    (TRAINING_LANE_COUNT - 1) * TRAINING_LANE_GAP;
const LEFT_START = -TOTAL_WIDTH / 2;
const TRAINING_PLAYER_SPAWN_DISTANCE_FROM_BALL =
    BALL_RADIUS + TRAINING_PLAYER_RADIUS + 4 + 10;

const createLane = (id: TrainingLaneId): TrainingLane => {
    const left = LEFT_START + id * (TRAINING_LANE_WIDTH + TRAINING_LANE_GAP);
    const right = left + TRAINING_LANE_WIDTH;
    const ball = {
        x: (left + right) / 2,
        y: 0,
    };

    return {
        id,
        name: LANE_NAMES[id],
        ball,
        playerSpawn: {
            x: ball.x - TRAINING_PLAYER_SPAWN_DISTANCE_FROM_BALL,
            y: 0,
        },
        bounds: {
            left,
            right,
            top: FIELD_TOP,
            bottom: FIELD_BOTTOM,
        },
    };
};

export const TRAINING_LANES: readonly TrainingLane[] = [
    createLane(0),
    createLane(1),
    createLane(2),
];

export function isInsideTrainingLane(
    lane: TrainingLane,
    point: PointLike,
): boolean {
    return isContainedInBounds(point, lane.bounds);
}

export function isInsideAnyTrainingLane(point: PointLike): boolean {
    return TRAINING_LANES.some((lane) => isInsideTrainingLane(lane, point));
}

export function getOutsideTrainingPosition(index: number): Position {
    const firstLane = TRAINING_LANES[0]!;

    return {
        x:
            firstLane.bounds.left -
            TRAINING_PLAYER_RADIUS * 2 -
            classicMapMeasures.YARD,
        y: -120 + index * 40,
    };
}

function randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function isValidTargetPlacement(
    lane: TrainingLane,
    candidate: TrainingTargetPlacement,
    placed: TrainingTargetPlacement[],
): boolean {
    if (!isInsideTrainingLane(lane, candidate)) return false;

    const ballDistance = getPointDistance(candidate, lane.ball);

    if (ballDistance < TRAINING_MIN_TARGET_DISTANCE_FROM_BALL) {
        return false;
    }

    return placed.every(
        (target) => getDistance(target, candidate) >= TRAINING_TARGET_MIN_GAP,
    );
}

function createTargetCandidate(lane: TrainingLane): TrainingTargetPlacement {
    const maxRadius = Math.min(
        lane.ball.x - lane.bounds.left,
        lane.bounds.right - lane.ball.x,
        lane.ball.y - lane.bounds.top,
        lane.bounds.bottom - lane.ball.y,
    );
    const radius = randomBetween(
        TRAINING_MIN_TARGET_DISTANCE_FROM_BALL,
        Math.max(TRAINING_MIN_TARGET_DISTANCE_FROM_BALL, maxRadius),
    );
    const angle = randomBetween(0, Math.PI * 2);

    return {
        x: lane.ball.x + Math.cos(angle) * radius,
        y: lane.ball.y + Math.sin(angle) * radius,
        radius: TRAINING_TARGET_RADIUS,
    };
}

function createFallbackTargetPlacements(
    lane: TrainingLane,
): TrainingTargetPlacement[] {
    const positions: TrainingTargetPlacement[] = [];
    const center = lane.ball;
    const radius = TRAINING_MIN_TARGET_DISTANCE_FROM_BALL + 35;

    for (let index = 0; index < TRAINING_TARGET_COUNT; index += 1) {
        const angle = (Math.PI * 2 * index) / TRAINING_TARGET_COUNT;
        const candidate = {
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius,
            radius: TRAINING_TARGET_RADIUS,
        };

        if (isInsideTrainingLane(lane, candidate)) {
            positions.push(candidate);
        }
    }

    return positions;
}

export function getPlayerSpawnForTargetPlacements(
    lane: TrainingLane,
    placements: readonly TrainingTargetPlacement[],
    activeTargets?: readonly boolean[],
): Position {
    const activePlacements = placements.filter(
        (_placement, index) => activeTargets?.[index] ?? true,
    );
    const leftTargets = activePlacements.filter(
        (placement) => placement.x < lane.ball.x,
    ).length;
    const rightTargets = activePlacements.filter(
        (placement) => placement.x > lane.ball.x,
    ).length;
    const spawnDirection = leftTargets > rightTargets ? 1 : -1;

    return {
        x:
            lane.ball.x +
            spawnDirection * TRAINING_PLAYER_SPAWN_DISTANCE_FROM_BALL,
        y: lane.ball.y,
    };
}

export function createTargetPlacements(
    lane: TrainingLane,
): TrainingTargetPlacement[] {
    const targets: TrainingTargetPlacement[] = [];
    const maxAttempts = 1500;

    for (
        let attempt = 0;
        attempt < maxAttempts && targets.length < TRAINING_TARGET_COUNT;
        attempt += 1
    ) {
        const candidate = createTargetCandidate(lane);

        if (isValidTargetPlacement(lane, candidate, targets)) {
            targets.push(candidate);
        }
    }

    if (targets.length === TRAINING_TARGET_COUNT) {
        return targets;
    }

    return createFallbackTargetPlacements(lane).slice(0, TRAINING_TARGET_COUNT);
}
