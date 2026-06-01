import type { FieldPosition } from "@common/game/game";
import {
    getDistance,
    type Line,
    type PointLike,
    type Ray,
} from "@common/math/geometry";
import { Team, type FieldTeam } from "@runtime/models";
import { flagMapMeasures as MapMeasures } from "@modes/flag/stadium";
import { getPositionFromFieldPosition } from "./position";

const OUTER_FIELD_EDGES: Line[] = [
    {
        start: {
            x: MapMeasures.OUTER_FIELD.topLeft.x,
            y: MapMeasures.OUTER_FIELD.topLeft.y,
        },
        end: {
            x: MapMeasures.OUTER_FIELD.bottomRight.x,
            y: MapMeasures.OUTER_FIELD.topLeft.y,
        },
    },
    {
        start: {
            x: MapMeasures.OUTER_FIELD.bottomRight.x,
            y: MapMeasures.OUTER_FIELD.topLeft.y,
        },
        end: {
            x: MapMeasures.OUTER_FIELD.bottomRight.x,
            y: MapMeasures.OUTER_FIELD.bottomRight.y,
        },
    },
    {
        start: {
            x: MapMeasures.OUTER_FIELD.bottomRight.x,
            y: MapMeasures.OUTER_FIELD.bottomRight.y,
        },
        end: {
            x: MapMeasures.OUTER_FIELD.topLeft.x,
            y: MapMeasures.OUTER_FIELD.bottomRight.y,
        },
    },
    {
        start: {
            x: MapMeasures.OUTER_FIELD.topLeft.x,
            y: MapMeasures.OUTER_FIELD.bottomRight.y,
        },
        end: {
            x: MapMeasures.OUTER_FIELD.topLeft.x,
            y: MapMeasures.OUTER_FIELD.topLeft.y,
        },
    },
];

export function isInMainField(position: Position): boolean {
    return (
        position.x >= MapMeasures.INNER_FIELD.topLeft.x &&
        position.x <= MapMeasures.INNER_FIELD.bottomRight.x
    );
}

export function isPartiallyOutsideMainField(position: PointLike): boolean {
    const minX = Math.min(
        MapMeasures.INNER_FIELD.topLeft.x,
        MapMeasures.INNER_FIELD.bottomRight.x,
    );
    const maxX = Math.max(
        MapMeasures.INNER_FIELD.topLeft.x,
        MapMeasures.INNER_FIELD.bottomRight.x,
    );
    const radius = Math.max(0, position.radius ?? 0);

    return position.x - radius < minX || position.x + radius > maxX;
}

export function isCompletelyInsideMainField(position: PointLike): boolean {
    return !isPartiallyOutsideMainField(position);
}

type OutOfBoundsMode = "ANY_PART" | "FULLY_OUTSIDE";

export function isOutOfBounds(
    position: PointLike,
    mode: OutOfBoundsMode = "ANY_PART",
): boolean {
    const minX = MapMeasures.OUTER_FIELD.topLeft.x;
    const maxX = MapMeasures.OUTER_FIELD.bottomRight.x;
    const minY = MapMeasures.OUTER_FIELD.topLeft.y;
    const maxY = MapMeasures.OUTER_FIELD.bottomRight.y;
    const radius = Math.max(0, position.radius ?? 0);

    if (mode === "FULLY_OUTSIDE") {
        return (
            position.x + radius < minX ||
            position.x - radius > maxX ||
            position.y + radius < minY ||
            position.y - radius > maxY
        );
    }

    return (
        position.x - radius < minX ||
        position.x + radius > maxX ||
        position.y - radius < minY ||
        position.y + radius > maxY
    );
}

export function isBallOutOfBounds(position: PointLike): boolean {
    return isOutOfBounds(position, "FULLY_OUTSIDE");
}

type ZoneBox = {
    topLeft: Position;
    bottomRight: Position;
};

function getEndZone(side: FieldTeam): ZoneBox {
    return side === Team.RED
        ? MapMeasures.END_ZONE_RED
        : MapMeasures.END_ZONE_BLUE;
}

function getRedZone(side: FieldTeam): ZoneBox {
    return side === Team.RED
        ? MapMeasures.RED_ZONE_RED
        : MapMeasures.RED_ZONE_BLUE;
}

const intersectsZoneBox = (position: PointLike, zone: ZoneBox): boolean => {
    const minX = Math.min(zone.topLeft.x, zone.bottomRight.x);
    const maxX = Math.max(zone.topLeft.x, zone.bottomRight.x);
    const minY = Math.min(zone.topLeft.y, zone.bottomRight.y);
    const maxY = Math.max(zone.topLeft.y, zone.bottomRight.y);
    const radius = Math.max(0, position.radius ?? 0);

    const closestX = Math.min(Math.max(position.x, minX), maxX);
    const closestY = Math.min(Math.max(position.y, minY), maxY);
    const dx = position.x - closestX;
    const dy = position.y - closestY;

    return dx * dx + dy * dy <= radius * radius;
};

export function intersectsEndZone(
    position: PointLike,
    endZoneSide: FieldTeam,
): boolean {
    return intersectsZoneBox(position, getEndZone(endZoneSide));
}

export function isInRedZone(
    offensiveTeam: FieldTeam,
    fieldPos: FieldPosition,
): boolean {
    const opponent = offensiveTeam === Team.RED ? Team.BLUE : Team.RED;
    const redZone = getRedZone(opponent);
    const minX = Math.min(redZone.topLeft.x, redZone.bottomRight.x);
    const maxX = Math.max(redZone.topLeft.x, redZone.bottomRight.x);
    const x = getPositionFromFieldPosition(fieldPos);

    return x >= minX && x <= maxX;
}

export function getBallPath(
    ballX: number,
    ballY: number,
    xSpeed: number,
    ySpeed: number,
): Ray {
    return {
        origin: { x: ballX, y: ballY },
        direction: { x: xSpeed, y: ySpeed },
    };
}

export type RaySegmentIntersectionResult =
    | { intersects: true; point: PointLike }
    | { intersects: false };

export function intersectRayWithSegment(
    ray: Ray,
    segment: Line,
): RaySegmentIntersectionResult {
    const ox = ray.origin.x;
    const oy = ray.origin.y;
    const dx = ray.direction.x;
    const dy = ray.direction.y;

    const x3 = segment.start.x;
    const y3 = segment.start.y;
    const x4 = segment.end.x;
    const y4 = segment.end.y;

    const segmentDx = x4 - x3;
    const segmentDy = y4 - y3;

    const denominator = dx * segmentDy - dy * segmentDx;

    if (Math.abs(denominator) < 1e-10) {
        return { intersects: false };
    }

    const t = ((x3 - ox) * segmentDy - (y3 - oy) * segmentDx) / denominator;
    const u = ((x3 - ox) * dy - (y3 - oy) * dx) / denominator;

    if (t >= 0 && u >= 0 && u <= 1) {
        return {
            intersects: true,
            point: {
                x: ox + t * dx,
                y: oy + t * dy,
            },
        };
    }

    return { intersects: false };
}

export function getRayIntersectionWithOuterField(ray: Ray): PointLike | null {
    const intersections = OUTER_FIELD_EDGES.map((edge) =>
        intersectRayWithSegment(ray, edge),
    )
        .filter(
            (result): result is { intersects: true; point: PointLike } =>
                result.intersects,
        )
        .map((result) => ({
            point: result.point,
            distance: getDistance(result.point, ray.origin),
        }));

    const [first] = intersections;

    if (!first) return null;

    const closest = intersections.reduce(
        (best, current) => (current.distance < best.distance ? current : best),
        first,
    );

    return closest.point;
}

export type GoalPostIntersection = {
    intersects: true;
    line: Line;
    point: PointLike;
};

export type GoalPostNoIntersection = { intersects: false };

export type GoalPostIntersectionResult =
    | GoalPostIntersection
    | GoalPostNoIntersection;

export type EndZoneLineIntersection = {
    intersects: true;
    line: Line;
    point: PointLike;
};

export type EndZoneLineNoIntersection = { intersects: false };

export type EndZoneLineIntersectionResult =
    | EndZoneLineIntersection
    | EndZoneLineNoIntersection;

export function intersectsGoalPosts(
    ray: Ray,
    team: FieldTeam,
): GoalPostIntersectionResult {
    const goalLine = getGoalLine(team);

    const intersection = intersectRayWithSegment(ray, goalLine);

    if (intersection.intersects) {
        return {
            intersects: true,
            line: {
                start: goalLine.start,
                end: goalLine.end,
            },
            point: intersection.point,
        };
    }

    return { intersects: false };
}

export function intersectsEndZoneLine(
    ray: Ray,
    team: FieldTeam,
): EndZoneLineIntersectionResult {
    const endZoneLine = getEndZoneLine(team);

    const intersection = intersectRayWithSegment(ray, endZoneLine);

    if (intersection.intersects) {
        return {
            intersects: true,
            line: {
                start: endZoneLine.start,
                end: endZoneLine.end,
            },
            point: intersection.point,
        };
    }

    return { intersects: false };
}

export function getEndZoneLine(team: FieldTeam): Line {
    const endZone = getEndZone(team);
    const x =
        team === Team.RED
            ? Math.min(endZone.topLeft.x, endZone.bottomRight.x)
            : Math.max(endZone.topLeft.x, endZone.bottomRight.x);

    return {
        start: {
            x,
            y: Math.min(endZone.topLeft.y, endZone.bottomRight.y),
        },
        end: {
            x,
            y: Math.max(endZone.topLeft.y, endZone.bottomRight.y),
        },
    };
}

export function getGoalLine(team: FieldTeam): Line {
    return team === Team.RED
        ? MapMeasures.RED_GOAL_LINE
        : MapMeasures.BLUE_GOAL_LINE;
}

export function isWithinGoalPosts(
    position: PointLike,
    team: FieldTeam,
): boolean {
    const goalLine = getGoalLine(team);
    const minY = Math.min(goalLine.start.y, goalLine.end.y);
    const maxY = Math.max(goalLine.start.y, goalLine.end.y);
    const radius = Math.max(0, position.radius ?? 0);

    return position.y + radius >= minY && position.y - radius <= maxY;
}
