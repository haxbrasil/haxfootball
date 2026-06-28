import type { FieldPosition } from "@common/game/game";
import type { Pair, Quad } from "@common/general/types";
import {
    dashedRectangleFromSegments,
    intersectsRectangle,
    type PointLike,
} from "@common/math/geometry";
import { SPECIAL_HIDDEN_POSITION } from "@common/stadium-builder/consts";
import { flagMapMeasures as MapMeasures } from "@modes/flag/stadium";
import { Team, type FieldTeam } from "@runtime/models";
import { getPositionFromFieldPosition } from "./position";

const dynamicLineRefs = (ref: string): Pair<string> => [`${ref}.a`, `${ref}.b`];

const OUTER_CROWDING_SEGMENTS: Pair<string>[] = [
    dynamicLineRefs("red0"),
    dynamicLineRefs("red1"),
    dynamicLineRefs("red2"),
    dynamicLineRefs("red3"),
    dynamicLineRefs("red4"),
    dynamicLineRefs("red5"),
    dynamicLineRefs("red6"),
    dynamicLineRefs("red7"),
    dynamicLineRefs("red8"),
    dynamicLineRefs("red9"),
    dynamicLineRefs("red10"),
    dynamicLineRefs("red11"),
];

const OUTER_CROWDING_CORNERS: Quad<string> = [
    "outerCrowdingCorner0",
    "outerCrowdingCorner1",
    "outerCrowdingCorner2",
    "outerCrowdingCorner3",
];

const INNER_CROWDING_SEGMENTS: Pair<string>[] = [
    dynamicLineRefs("white0"),
    dynamicLineRefs("white1"),
    dynamicLineRefs("white2"),
    dynamicLineRefs("white3"),
    dynamicLineRefs("white4"),
    dynamicLineRefs("white5"),
    dynamicLineRefs("tail0"),
    dynamicLineRefs("tail1"),
];

const INNER_CROWDING_CORNERS: Quad<string> = [
    "innerCrowdingCorner0",
    "innerCrowdingCorner1",
    "innerCrowdingCorner2",
    "innerCrowdingCorner3",
];

const CROWDING_OUTER_BEHIND_YARDS = 2.5;
const CROWDING_OUTER_AHEAD_YARDS = 6;
const CROWDING_OUTER_AHEAD_RED_ZONE_YARDS = 4;
const CROWDING_INNER_AHEAD_YARDS = 3;
const CROWDING_MIN_YARD_LINE = 2;
const CROWDING_RED_ZONE_AHEAD_MAX_YARD_LINE = 10;
const CROWDING_INNER_DISABLED_MAX_YARD_LINE = 2;
const CROWDING_INNER_HEIGHT_RATIO = 0.5;
const CROWDING_INNER_MIN_GAP_TO_OUTER_TOP_YARDS = 2;
const CROWDING_INNER_MIN_GAP_TO_OUTER_FRONT_YARDS = 2;
const CROWDING_INNER_MIN_HEIGHT_YARDS = 2;
const CROWDING_INNER_MIN_WIDTH_YARDS = 1;

type CrowdingPlacement = readonly [string, number, number];
type CrowdingRectangle = {
    start: Pair<number>;
    direction: 1 | -1;
    extension: Pair<number>;
};

function getCrowdingDirection(team: FieldTeam): 1 | -1 {
    return team === Team.RED ? 1 : -1;
}

function getOpponent(team: FieldTeam): FieldTeam {
    return team === Team.RED ? Team.BLUE : Team.RED;
}

function getCrowdingOuterAheadYards(
    offensiveTeam: FieldTeam,
    fieldPos: FieldPosition,
): number {
    if (
        fieldPos.side === getOpponent(offensiveTeam) &&
        fieldPos.yards <= CROWDING_RED_ZONE_AHEAD_MAX_YARD_LINE
    ) {
        return CROWDING_OUTER_AHEAD_RED_ZONE_YARDS;
    }

    return CROWDING_OUTER_AHEAD_YARDS;
}

function getCrowdingHashBand() {
    const { upperY, lowerY } = MapMeasures.HASHES_HEIGHT;
    const hashHeight = MapMeasures.SINGLE_HASH_HEIGHT;
    return {
        yMid: (upperY + lowerY) / 2,
        height: Math.abs(lowerY - upperY) - 2 * hashHeight,
    };
}

const CROWDING_MIN_X = Math.min(
    getPositionFromFieldPosition({
        side: Team.RED,
        yards: CROWDING_MIN_YARD_LINE,
    }),
    getPositionFromFieldPosition({
        side: Team.BLUE,
        yards: CROWDING_MIN_YARD_LINE,
    }),
);
const CROWDING_MAX_X = Math.max(
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
    return Math.min(CROWDING_MAX_X, Math.max(CROWDING_MIN_X, x));
}

function isInnerCrowdingDisabledAtLine(fieldPos: FieldPosition): boolean {
    return fieldPos.yards <= CROWDING_INNER_DISABLED_MAX_YARD_LINE;
}

function crowdingDashSize(
    segments: readonly Pair<string>[],
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
    segments: readonly Pair<string>[],
    corners: Quad<string>,
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
    const outerAheadYards = getCrowdingOuterAheadYards(offensiveTeam, fieldPos);

    const outerStartX = clampCrowdingX(
        losX - direction * CROWDING_OUTER_BEHIND_YARDS * yard,
    );
    const outerEndX = clampCrowdingX(losX + direction * outerAheadYards * yard);
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
