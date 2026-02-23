import { Team, type FieldTeam } from "@runtime/models";
import {
    dashedRectangleFromSegments,
    getDistance,
    intersectsRectangle,
    Line,
    PointLike,
    Ray,
} from "@common/math/geometry";
import {
    calculateFieldPosition,
    calculatePositionFromFieldPosition,
    FieldPosition,
} from "@common/game/game";
import type { Pair, Quad } from "@common/general/types";
import {
    BALL_COLOR,
    BALL_RADIUS,
    index,
    legacyMapMeasures as MapMeasures,
    lineIndex,
    LOS_BLOCKER_DISC_COUNT,
    PlaneMaskName,
    PLANE_MASK_BY_NAME,
} from "@meta/legacy/stadium";
import { hexColorToNumber } from "@common/general/color";
import { CollisionFlag } from "@haxball/stadium";
import { SPECIAL_HIDDEN_POSITION } from "@common/stadium-builder/consts";

const OUTER_CROWDING_SEGMENTS: Pair<number>[] = [
    lineIndex("red0"),
    lineIndex("red1"),
    lineIndex("red2"),
    lineIndex("red3"),
    lineIndex("red4"),
    lineIndex("red5"),
    lineIndex("red6"),
    lineIndex("red7"),
    lineIndex("red8"),
    lineIndex("red9"),
    lineIndex("red10"),
    lineIndex("red11"),
];

const OUTER_CROWDING_CORNERS: Quad<number> = [
    index("outerCrowdingCorner0"),
    index("outerCrowdingCorner1"),
    index("outerCrowdingCorner2"),
    index("outerCrowdingCorner3"),
];

const INNER_CROWDING_SEGMENTS: Pair<number>[] = [
    lineIndex("white0"),
    lineIndex("white1"),
    lineIndex("white2"),
    lineIndex("white3"),
    lineIndex("white4"),
    lineIndex("white5"),
    lineIndex("tail0"),
    lineIndex("tail1"),
];

const INNER_CROWDING_CORNERS: Quad<number> = [
    index("innerCrowdingCorner0"),
    index("innerCrowdingCorner1"),
    index("innerCrowdingCorner2"),
    index("innerCrowdingCorner3"),
];

const SPECIAL_DISC_IDS = {
    LOS: lineIndex("blue0"),
    FIRST_DOWN: lineIndex("orange0"),
    INTERCEPTION_PATH: lineIndex("ball0"),
    LOS_BLOCKERS: Array.from(
        { length: LOS_BLOCKER_DISC_COUNT },
        (_, blockerIndex) => index(`losBlocker${blockerIndex}`),
    ),
};

export const getPlaneMask = (name: PlaneMaskName): CollisionFlag =>
    PLANE_MASK_BY_NAME[name];

export const BALL_DISC_ID = 0;
export const BALL_ACTIVE_COLOR = hexColorToNumber(BALL_COLOR);
export const BALL_INACTIVE_COLOR = 0x808080;

const CROWDING_OUTER_BEHIND_YARDS = 2.5;
const CROWDING_OUTER_AHEAD_YARDS = 7;
const CROWDING_INNER_AHEAD_YARDS = 3;

const HASH_UPPER_CENTER_Y =
    MapMeasures.HASHES_HEIGHT.upperY + MapMeasures.SINGLE_HASH_HEIGHT / 2;
const HASH_LOWER_CENTER_Y =
    MapMeasures.HASHES_HEIGHT.lowerY - MapMeasures.SINGLE_HASH_HEIGHT / 2;

export const BALL_OFFSET_YARDS = 2.5;
export const YARD_LENGTH = MapMeasures.YARD;

export const TOUCHBACK_YARD_LINE = 25;
export const KICKOFF_OUT_OF_BOUNDS_YARD_LINE = 40;

export function offsetXByYards(
    baseX: number,
    direction: 1 | -1,
    yards: number,
): number {
    return baseX + direction * yards * YARD_LENGTH;
}

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

export function clampToHashCenterY(y: number): number {
    if (y < HASH_UPPER_CENTER_Y) {
        return HASH_UPPER_CENTER_Y;
    }

    if (y > HASH_LOWER_CENTER_Y) {
        return HASH_LOWER_CENTER_Y;
    }

    return y;
}

export function getFieldPosition(
    x: number,
    startX = MapMeasures.RED_END_ZONE_START_POSITION_X,
    endX = MapMeasures.BLUE_END_ZONE_START_POSITION_X,
    yardLength = MapMeasures.YARD,
): FieldPosition {
    return calculateFieldPosition(x, startX, endX, yardLength);
}

export function isInMainField(position: Position): boolean {
    return (
        position.x >= MapMeasures.INNER_FIELD.topLeft.x &&
        position.x <= MapMeasures.INNER_FIELD.bottomRight.x
    );
}

export function intersectsMainField(position: PointLike): boolean {
    const minX = Math.min(
        MapMeasures.INNER_FIELD.topLeft.x,
        MapMeasures.INNER_FIELD.bottomRight.x,
    );
    const maxX = Math.max(
        MapMeasures.INNER_FIELD.topLeft.x,
        MapMeasures.INNER_FIELD.bottomRight.x,
    );
    const radius = Math.max(0, position.radius ?? 0);

    return position.x + radius >= minX && position.x - radius <= maxX;
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

export function isCompletelyOutsideMainField(position: PointLike): boolean {
    return !intersectsMainField(position);
}

export function getPositionFromFieldPosition(
    fieldPos: FieldPosition,
    startX = MapMeasures.RED_END_ZONE_LINE_CENTER.x,
    endX = MapMeasures.BLUE_END_ZONE_LINE_CENTER.x,
    yardLength = MapMeasures.YARD,
): number {
    return calculatePositionFromFieldPosition(
        fieldPos,
        startX,
        endX,
        yardLength,
    );
}

export function calculateSnapBallPosition(
    forTeam: Team,
    fieldPos: FieldPosition,
    offsetYards = 0,
    yardLength = MapMeasures.YARD,
): Position {
    return {
        x:
            getPositionFromFieldPosition(fieldPos) +
            yardLength * offsetYards * (forTeam === Team.RED ? -1 : 1),
        y: 0,
    };
}

export function ballWithRadius(
    position: Position,
    radius = BALL_RADIUS,
): PointLike {
    return {
        x: position.x,
        y: position.y,
        radius,
    };
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

export function isInExtraPointZone(
    position: PointLike,
    offensiveTeam: FieldTeam,
): boolean {
    const opponent = offensiveTeam === Team.RED ? Team.BLUE : Team.RED;

    return (
        intersectsZoneBox(position, getEndZone(opponent)) ||
        intersectsZoneBox(position, getRedZone(opponent))
    );
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

export function getDistanceToGoalLine(
    offensiveTeam: FieldTeam,
    fieldPos: FieldPosition,
): number {
    const goalLineX =
        offensiveTeam === Team.RED
            ? MapMeasures.BLUE_END_ZONE_LINE_CENTER.x
            : MapMeasures.RED_END_ZONE_LINE_CENTER.x;
    const currentX = getPositionFromFieldPosition(fieldPos);
    const directionalX =
        offensiveTeam === Team.RED
            ? goalLineX - currentX
            : currentX - goalLineX;

    return Math.max(0, xDistanceToYards(directionalX));
}

export function getLineOfScrimmage(): { id: number }[];
export function getLineOfScrimmage(
    fieldPos: FieldPosition,
): { id: number; position: Position }[];
export function getLineOfScrimmage(
    fieldPos?: FieldPosition,
): { id: number; position?: Position }[] {
    if (fieldPos === undefined) {
        return [
            { id: SPECIAL_DISC_IDS.LOS[0] },
            { id: SPECIAL_DISC_IDS.LOS[1] },
        ];
    }

    const x = getPositionFromFieldPosition(fieldPos);
    const offset = 2;
    const upperHashY = MapMeasures.INNER_FIELD.topLeft.y + offset;
    const lowerHashY = MapMeasures.INNER_FIELD.bottomRight.y - offset;

    return [
        { id: SPECIAL_DISC_IDS.LOS[0], position: { x, y: upperHashY } },
        { id: SPECIAL_DISC_IDS.LOS[1], position: { x, y: lowerHashY } },
    ];
}

export function getFirstDownLine(): { id: number }[];
export function getFirstDownLine(
    offensiveTeam: Team,
    fieldPos: FieldPosition,
    distance: number,
): { id: number; position: Position }[];
export function getFirstDownLine(
    offensiveTeam?: Team,
    fieldPos?: FieldPosition,
    distance?: number,
): { id: number; position?: Position }[] {
    if (
        offensiveTeam === undefined ||
        fieldPos === undefined ||
        distance === undefined
    ) {
        return [
            { id: SPECIAL_DISC_IDS.FIRST_DOWN[0] },
            { id: SPECIAL_DISC_IDS.FIRST_DOWN[1] },
        ];
    }

    const losX = getPositionFromFieldPosition(fieldPos);
    const yardsInX = distance * MapMeasures.YARD;
    const direction = offensiveTeam === Team.RED ? 1 : -1;
    const x = losX + yardsInX * direction;

    const offset = 2;
    const upperHashY = MapMeasures.INNER_FIELD.topLeft.y + offset;
    const lowerHashY = MapMeasures.INNER_FIELD.bottomRight.y - offset;

    return [
        { id: SPECIAL_DISC_IDS.FIRST_DOWN[0], position: { x, y: upperHashY } },
        { id: SPECIAL_DISC_IDS.FIRST_DOWN[1], position: { x, y: lowerHashY } },
    ];
}

export function getInterceptionPath(): { id: number }[];
export function getInterceptionPath(
    line: Line,
): { id: number; position: Position }[];
export function getInterceptionPath(
    line?: Line,
): { id: number; position?: Position }[] {
    if (!line) {
        return [
            { id: SPECIAL_DISC_IDS.INTERCEPTION_PATH[0] },
            { id: SPECIAL_DISC_IDS.INTERCEPTION_PATH[1] },
        ];
    }

    return [
        {
            id: SPECIAL_DISC_IDS.INTERCEPTION_PATH[0],
            position: { x: line.start.x, y: line.start.y },
        },
        {
            id: SPECIAL_DISC_IDS.INTERCEPTION_PATH[1],
            position: { x: line.end.x, y: line.end.y },
        },
    ];
}

export function getLineOfScrimmageBlockers(): { id: number }[] {
    return SPECIAL_DISC_IDS.LOS_BLOCKERS.map((id) => ({ id }));
}

type CrowdingPlacement = readonly [number, number, number];
type CrowdingRectangle = {
    start: Pair<number>;
    direction: 1 | -1;
    extension: Pair<number>;
};

function getCrowdingDirection(team: FieldTeam): 1 | -1 {
    return team === Team.RED ? 1 : -1;
}

function getCrowdingHashBand() {
    const { upperY, lowerY } = MapMeasures.HASHES_HEIGHT;
    const hashHeight = MapMeasures.SINGLE_HASH_HEIGHT;
    return {
        yMid: (upperY + lowerY) / 2,
        height: Math.abs(lowerY - upperY) - 2 * hashHeight,
    };
}

const CROWDING_MIN_YARD_LINE = 1;
const CROWDING_INNER_DISABLED_MAX_YARD_LINE = 2;
const CROWDING_INNER_HEIGHT_RATIO = 0.5;
const CROWDING_INNER_MIN_GAP_TO_OUTER_TOP_YARDS = 2;
const CROWDING_INNER_MIN_GAP_TO_OUTER_FRONT_YARDS = 2;
const CROWDING_INNER_MIN_HEIGHT_YARDS = 2;
const CROWDING_INNER_MIN_WIDTH_YARDS = 1;

const CROWDING_ONE_YARD_MIN_X = Math.min(
    getPositionFromFieldPosition({
        side: Team.RED,
        yards: CROWDING_MIN_YARD_LINE,
    }),
    getPositionFromFieldPosition({
        side: Team.BLUE,
        yards: CROWDING_MIN_YARD_LINE,
    }),
);
const CROWDING_ONE_YARD_MAX_X = Math.max(
    getPositionFromFieldPosition({
        side: Team.RED,
        yards: CROWDING_MIN_YARD_LINE,
    }),
    getPositionFromFieldPosition({
        side: Team.BLUE,
        yards: CROWDING_MIN_YARD_LINE,
    }),
);

function clampCrowdingX(x: number) {
    return Math.min(
        CROWDING_ONE_YARD_MAX_X,
        Math.max(CROWDING_ONE_YARD_MIN_X, x),
    );
}

function isInnerCrowdingDisabledAtLine(fieldPos: FieldPosition): boolean {
    return fieldPos.yards <= CROWDING_INNER_DISABLED_MAX_YARD_LINE;
}

function crowdingDashSize(
    segments: readonly Pair<number>[],
    extension: Pair<number>,
) {
    const [w, h] = extension;
    const perimeter = 2 * (Math.abs(w) + Math.abs(h));
    return perimeter / (segments.length * 2);
}

function hiddenCrowdingRectangle(): CrowdingRectangle {
    return {
        start: SPECIAL_HIDDEN_POSITION,
        direction: 1,
        extension: [MapMeasures.YARD, MapMeasures.YARD],
    };
}

function disabledCrowdingRectangle(): CrowdingRectangle {
    const hidden = hiddenCrowdingRectangle();

    return {
        start: hidden.start,
        direction: hidden.direction,
        extension: [0, 0],
    };
}

function placeCrowdingBox(
    segments: readonly Pair<number>[],
    corners: Quad<number>,
    rect: CrowdingRectangle,
): CrowdingPlacement[] {
    const [width, height] = rect.extension;

    if (
        !Number.isFinite(width) ||
        width <= 0 ||
        !Number.isFinite(height) ||
        height <= 0
    ) {
        const hidden = hiddenCrowdingRectangle();
        return dashedRectangleFromSegments(
            segments,
            corners,
            hidden.start,
            hidden.direction,
            hidden.extension,
            crowdingDashSize(segments, hidden.extension),
        );
    }

    return dashedRectangleFromSegments(
        segments,
        corners,
        rect.start,
        rect.direction,
        rect.extension,
        crowdingDashSize(segments, rect.extension),
    );
}

function getCrowdingRectangles(
    offensiveTeam: FieldTeam,
    fieldPos: FieldPosition,
): { outer: CrowdingRectangle; inner: CrowdingRectangle } {
    const direction = getCrowdingDirection(offensiveTeam);
    const losX = getPositionFromFieldPosition(fieldPos);
    const { yMid, height: outerHeight } = getCrowdingHashBand();
    const yard = MapMeasures.YARD;

    const outerStartX = clampCrowdingX(
        losX - direction * CROWDING_OUTER_BEHIND_YARDS * yard,
    );
    const outerEndX = clampCrowdingX(
        losX + direction * CROWDING_OUTER_AHEAD_YARDS * yard,
    );
    const innerStartX = clampCrowdingX(losX);
    const rawInnerEndX = clampCrowdingX(
        losX + direction * CROWDING_INNER_AHEAD_YARDS * yard,
    );
    const maxDirectionalInnerEnd =
        direction * outerEndX -
        CROWDING_INNER_MIN_GAP_TO_OUTER_FRONT_YARDS * yard;
    const innerEndX =
        direction * Math.min(direction * rawInnerEndX, maxDirectionalInnerEnd);

    const toExtension = (
        startX: number,
        endX: number,
        height: number,
    ): Pair<number> => {
        const width = (endX - startX) * direction;
        return [Math.max(0, width), height];
    };

    const outer: CrowdingRectangle = {
        start: [outerStartX, yMid],
        direction,
        extension: toExtension(outerStartX, outerEndX, outerHeight),
    };

    const maxInnerHeightFromGap =
        outerHeight - 2 * CROWDING_INNER_MIN_GAP_TO_OUTER_TOP_YARDS * yard;
    const rawInnerHeight = outerHeight * CROWDING_INNER_HEIGHT_RATIO;
    const innerHeight = Math.min(rawInnerHeight, maxInnerHeightFromGap);
    const minInnerHeight = CROWDING_INNER_MIN_HEIGHT_YARDS * yard;
    const innerWidth = (innerEndX - innerStartX) * direction;
    const minInnerWidth = CROWDING_INNER_MIN_WIDTH_YARDS * yard;

    const shouldDisableInner =
        isInnerCrowdingDisabledAtLine(fieldPos) ||
        !Number.isFinite(innerHeight) ||
        innerHeight < minInnerHeight ||
        !Number.isFinite(innerWidth) ||
        innerWidth < minInnerWidth;

    if (shouldDisableInner) {
        return {
            outer,
            inner: disabledCrowdingRectangle(),
        };
    }

    return {
        outer,
        inner: {
            start: [innerStartX, yMid],
            direction,
            extension: toExtension(innerStartX, innerEndX, innerHeight),
        },
    };
}

export function isInCrowdingArea(
    player: PointLike,
    offensiveTeam: FieldTeam,
    fieldPos: FieldPosition,
): boolean {
    const { outer, inner } = getCrowdingRectangles(offensiveTeam, fieldPos);

    const [outerWidth, outerHeight] = outer.extension;
    const [innerWidth, innerHeight] = inner.extension;

    const inOuter =
        outerWidth > 0 &&
        outerHeight > 0 &&
        intersectsRectangle(
            player,
            outer.start,
            outer.direction,
            outer.extension,
        );
    const inInner =
        innerWidth > 0 &&
        innerHeight > 0 &&
        intersectsRectangle(
            player,
            inner.start,
            inner.direction,
            inner.extension,
        );

    return inOuter || inInner;
}

export function isInInnerCrowdingArea(
    player: PointLike,
    offensiveTeam: FieldTeam,
    fieldPos: FieldPosition,
): boolean {
    const { inner } = getCrowdingRectangles(offensiveTeam, fieldPos);
    const [innerWidth, innerHeight] = inner.extension;

    return (
        innerWidth > 0 &&
        innerHeight > 0 &&
        intersectsRectangle(
            player,
            inner.start,
            inner.direction,
            inner.extension,
        )
    );
}

export function arrangeCrowdingBoxes(
    offensiveTeam: FieldTeam,
    fieldPos: FieldPosition,
): CrowdingPlacement[] {
    const { outer, inner } = getCrowdingRectangles(offensiveTeam, fieldPos);

    return [
        ...placeCrowdingBox(
            OUTER_CROWDING_SEGMENTS,
            OUTER_CROWDING_CORNERS,
            outer,
        ),
        ...placeCrowdingBox(
            INNER_CROWDING_SEGMENTS,
            INNER_CROWDING_CORNERS,
            inner,
        ),
    ];
}

export function hideCrowdingBoxes(): CrowdingPlacement[] {
    const hidden = hiddenCrowdingRectangle();

    return [
        ...placeCrowdingBox(
            OUTER_CROWDING_SEGMENTS,
            OUTER_CROWDING_CORNERS,
            hidden,
        ),
        ...placeCrowdingBox(
            INNER_CROWDING_SEGMENTS,
            INNER_CROWDING_CORNERS,
            hidden,
        ),
    ];
}

export function xDistanceToYards(xDistance: number): number {
    return Math.round(xDistance / MapMeasures.YARD);
}

export function calculateDirectionalGain(
    offensiveTeam: Team,
    xGained: number,
): number {
    return offensiveTeam === Team.RED ? xGained : -xGained;
}

export function calculateYardsGained(
    offensiveTeam: Team,
    fromFieldPos: FieldPosition,
    toFieldPos: FieldPosition,
): number {
    const fromX = getPositionFromFieldPosition(fromFieldPos);
    const toX = getPositionFromFieldPosition(toFieldPos);
    const xGained = toX - fromX;

    return xDistanceToYards(calculateDirectionalGain(offensiveTeam, xGained));
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
