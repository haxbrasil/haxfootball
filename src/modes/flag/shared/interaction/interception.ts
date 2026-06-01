import type { GameStateBall } from "@runtime/engine";
import { getDistance, PointLike, type Ray } from "@common/math/geometry";
import { Team, type FieldTeam } from "@runtime/models";
import {
    type EndZoneLineIntersection,
    type EndZoneLineIntersectionResult,
    getBallPath,
    getRayIntersectionWithOuterField,
    intersectsEndZoneLine,
} from "@modes/flag/shared/field";

type EndZoneLineIntersectionCandidate = {
    point: PointLike;
    distance: number;
};

const isEndZoneLineIntersection = (
    result: EndZoneLineIntersectionResult,
): result is EndZoneLineIntersection => result.intersects;

const isMovingTowardGoal = (goal: FieldTeam, xDirection: number): boolean => {
    if (xDirection === 0) return false;

    return goal === Team.RED ? xDirection < 0 : xDirection > 0;
};

const pickClosestIntersection = (
    candidates: EndZoneLineIntersectionCandidate[],
): EndZoneLineIntersectionCandidate | null => {
    const [first] = candidates;
    if (!first) return null;

    return candidates.reduce(
        (closest, candidate) =>
            candidate.distance < closest.distance ? candidate : closest,
        first,
    );
};

function getClosestEndZoneLineIntersection({
    ballPath,
    goals,
    maxDistance = Number.POSITIVE_INFINITY,
}: {
    ballPath: Ray;
    goals: readonly FieldTeam[];
    maxDistance?: number;
}): EndZoneLineIntersectionCandidate | null {
    const intersections = goals
        .filter((goal) => isMovingTowardGoal(goal, ballPath.direction.x))
        .map((goal) => intersectsEndZoneLine(ballPath, goal))
        .filter(isEndZoneLineIntersection)
        .map<EndZoneLineIntersectionCandidate>((result) => ({
            point: result.point,
            distance: getDistance(result.point, ballPath.origin),
        }))
        .filter((candidate) => candidate.distance <= maxDistance + 1e-6);

    return pickClosestIntersection(intersections);
}

function getTravelEndZoneLineIntersection({
    from,
    to,
    goals,
}: {
    from: GameStateBall;
    to: GameStateBall;
    goals: readonly FieldTeam[];
}): EndZoneLineIntersectionCandidate | null {
    const distance = getDistance(from, to);
    if (distance <= 0) return null;

    return getClosestEndZoneLineIntersection({
        ballPath: getBallPath(from.x, from.y, to.x - from.x, to.y - from.y),
        goals,
        maxDistance: distance,
    });
}

function isOutOfBoundsBeforeGoal({
    ballPath,
    goalIntersection,
}: {
    ballPath: Ray;
    goalIntersection: EndZoneLineIntersectionCandidate;
}): boolean {
    const outOfBoundsPoint = getRayIntersectionWithOuterField(ballPath);
    if (!outOfBoundsPoint) return false;

    const goalDistance = getDistance(goalIntersection.point, ballPath.origin);
    const outDistance = getDistance(outOfBoundsPoint, ballPath.origin);

    return outDistance < goalDistance;
}

export function getTravelInterceptionPoint({
    previousBall,
    currentBall,
    goals,
}: {
    previousBall: GameStateBall;
    currentBall: GameStateBall;
    goals: readonly FieldTeam[];
}): PointLike | null {
    const intersection = getTravelEndZoneLineIntersection({
        from: previousBall,
        to: currentBall,
        goals,
    });

    return intersection ? intersection.point : null;
}

export function getProjectedInterceptionPointFromTravel({
    previousBall,
    currentBall,
    goals,
}: {
    previousBall: GameStateBall;
    currentBall: GameStateBall;
    goals: readonly FieldTeam[];
}): PointLike | null {
    const distance = getDistance(previousBall, currentBall);
    if (distance <= 0) return null;

    const ballPath = getBallPath(
        previousBall.x,
        previousBall.y,
        currentBall.x - previousBall.x,
        currentBall.y - previousBall.y,
    );
    const intersection = getClosestEndZoneLineIntersection({
        ballPath,
        goals,
    });

    if (!intersection) return null;

    if (
        isOutOfBoundsBeforeGoal({
            ballPath,
            goalIntersection: intersection,
        })
    ) {
        return null;
    }

    return intersection.point;
}

export function getProjectedInterceptionPoint({
    ball,
    goals,
}: {
    ball: GameStateBall;
    goals: readonly FieldTeam[];
}): PointLike | null {
    const ballPath = getBallPath(ball.x, ball.y, ball.xspeed, ball.yspeed);
    const intersection = getClosestEndZoneLineIntersection({
        ballPath,
        goals,
    });

    if (!intersection) return null;

    if (
        isOutOfBoundsBeforeGoal({
            ballPath,
            goalIntersection: intersection,
        })
    ) {
        return null;
    }

    return intersection.point;
}
