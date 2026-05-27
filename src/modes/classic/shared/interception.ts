import type { GameStateBall } from "@runtime/engine";
import { getDistance, PointLike, type Ray } from "@common/math/geometry";
import { Team, type FieldTeam } from "@runtime/models";
import {
    type GoalPostIntersection,
    type GoalPostIntersectionResult,
    getBallPath,
    getRayIntersectionWithOuterField,
    intersectsGoalPosts,
} from "@modes/classic/shared/stadium";

type GoalPostIntersectionCandidate = {
    point: PointLike;
    distance: number;
};

const isGoalPostIntersection = (
    result: GoalPostIntersectionResult,
): result is GoalPostIntersection => result.intersects;

const isMovingTowardGoal = (goal: FieldTeam, xDirection: number): boolean => {
    if (xDirection === 0) return false;

    return goal === Team.RED ? xDirection < 0 : xDirection > 0;
};

const pickClosestIntersection = (
    candidates: GoalPostIntersectionCandidate[],
): GoalPostIntersectionCandidate | null => {
    const [first] = candidates;
    if (!first) return null;

    return candidates.reduce(
        (closest, candidate) =>
            candidate.distance < closest.distance ? candidate : closest,
        first,
    );
};

function getClosestGoalPostIntersection({
    ballPath,
    goals,
    maxDistance = Number.POSITIVE_INFINITY,
}: {
    ballPath: Ray;
    goals: readonly FieldTeam[];
    maxDistance?: number;
}): GoalPostIntersectionCandidate | null {
    const intersections = goals
        .filter((goal) => isMovingTowardGoal(goal, ballPath.direction.x))
        .map((goal) => intersectsGoalPosts(ballPath, goal))
        .filter(isGoalPostIntersection)
        .map<GoalPostIntersectionCandidate>((result) => ({
            point: result.point,
            distance: getDistance(result.point, ballPath.origin),
        }))
        .filter((candidate) => candidate.distance <= maxDistance + 1e-6);

    return pickClosestIntersection(intersections);
}

function getTravelGoalPostIntersection({
    from,
    to,
    goals,
}: {
    from: GameStateBall;
    to: GameStateBall;
    goals: readonly FieldTeam[];
}): GoalPostIntersectionCandidate | null {
    const distance = getDistance(from, to);
    if (distance <= 0) return null;

    return getClosestGoalPostIntersection({
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
    goalIntersection: GoalPostIntersectionCandidate;
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
    const intersection = getTravelGoalPostIntersection({
        from: previousBall,
        to: currentBall,
        goals,
    });

    return intersection ? intersection.point : null;
}

export function getProjectedInterceptionPoint({
    ball,
    goals,
}: {
    ball: GameStateBall;
    goals: readonly FieldTeam[];
}): PointLike | null {
    const ballPath = getBallPath(ball.x, ball.y, ball.xspeed, ball.yspeed);
    const intersection = getClosestGoalPostIntersection({
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
