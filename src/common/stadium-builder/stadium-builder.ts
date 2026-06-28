import type { Disc } from "@haxball/stadium";
import type { Pair } from "@common/general/types";
import { defineStadium } from "@common/stadium-generator";
import type {
    LineSpec,
    PlaneSpec,
    RectSpec,
    SegmentProps,
    StadiumBuild,
    StadiumSchema,
    VertexProps,
} from "@common/stadium-generator";
import { line, vLine } from "@common/stadium-generator/utils";

type RectBounds = {
    leftX: number;
    rightX: number;
    topY: number;
    bottomY: number;
};

type FieldDimensions = {
    width: number;
    height: number;
};

type HashMarkMeasures = {
    bandTopY: number;
    bandBottomY: number;
    markHeight: number;
    subdivisionYards: number;
};

type TickMeasures = {
    height: number;
    offsetYards: number;
    greenYards?: number[];
    greenTopYards?: number[];
    greenBottomYards?: number[];
};

type GoalPostMeasures = {
    leftX: number;
    rightX: number;
    topY: number;
    bottomY: number;
    segment: SegmentProps;
    vertex?: VertexProps;
    posts?: Array<{ from: Pair<number>; to: Pair<number> }>;
    disc?: Omit<Disc, "pos">;
};

type CollisionSidelineMeasures = {
    leftX: number;
    rightX: number;
    topY: number;
    bottomY: number;
    segment: SegmentProps;
    vertex?: VertexProps;
};

type BallBoundaryMeasures = {
    leftX: number;
    rightX: number;
    topY: number;
    bottomY: number;
    leftSegment: SegmentProps;
    rightSegment: SegmentProps;
    vertex?: VertexProps;
};

export type StadiumFeatures = {
    goalPosts?: GoalPostMeasures;
    collisionSidelines?: CollisionSidelineMeasures;
    ballBoundaries?: BallBoundaryMeasures;
    planes?: PlaneSpec[];
    discs?: Disc[];
};

type YardLineMeasures = {
    intervalYards: number;
    redZoneYards?: number;
};

export type StadiumMeasures = {
    name: string;
    size: { width: number; height: number };
    field: FieldDimensions;
    endZones: { depth: number };
    goal: { width: number };
    yard: { length: number; lines: YardLineMeasures };
    hashMarks: HashMarkMeasures;
    ticks?: TickMeasures;
};

export type StadiumLineColors = {
    yard: {
        default: string;
        goal: string;
        redZone?: string;
        midfield?: string;
    };
    hash: string;
    tick: string;
    tickGreen?: string;
};

export type StadiumMapMeasures = {
    END_ZONE_RED: {
        topLeft: { x: number; y: number };
        bottomRight: { x: number; y: number };
    };
    END_ZONE_BLUE: {
        topLeft: { x: number; y: number };
        bottomRight: { x: number; y: number };
    };
    RED_ZONE_RED: {
        topLeft: { x: number; y: number };
        bottomRight: { x: number; y: number };
    };
    RED_ZONE_BLUE: {
        topLeft: { x: number; y: number };
        bottomRight: { x: number; y: number };
    };
    INNER_FIELD: {
        topLeft: { x: number; y: number };
        bottomRight: { x: number; y: number };
    };
    OUTER_FIELD: {
        topLeft: { x: number; y: number };
        bottomRight: { x: number; y: number };
    };
    RED_GOAL_LINE: {
        start: { x: number; y: number };
        end: { x: number; y: number };
    };
    BLUE_GOAL_LINE: {
        start: { x: number; y: number };
        end: { x: number; y: number };
    };
    GOAL_POST_RADIUS: number;
    HASHES_HEIGHT: { upperY: number; lowerY: number };
    SINGLE_HASH_HEIGHT: number;
    RED_END_ZONE_START_POSITION_X: number;
    BLUE_END_ZONE_START_POSITION_X: number;
    RED_END_ZONE_LINE_CENTER: { x: number; y: number };
    BLUE_END_ZONE_LINE_CENTER: { x: number; y: number };
    YARD: number;
    HASH_SUBDIVISION: number;
    YARDS_BETWEEN_0_MARK_AND_GOAL_LINE: number;
};

export type StadiumBuildResult = StadiumBuild & {
    mapMeasures: StadiumMapMeasures;
};

export type BuildStadiumOptions = {
    measures: StadiumMeasures;
    colors: StadiumLineColors;
    features?: StadiumFeatures;
    schema?: Omit<Partial<StadiumSchema>, "lines" | "rects"> & {
        lines?: LineSpec[];
        rects?: RectSpec[];
    };
};

const buildFieldBounds = (inner: RectBounds, color: string): RectSpec => ({
    ref: "fieldBounds",
    x: [inner.leftX, inner.rightX],
    y: [inner.topY, inner.bottomY],
    segment: { color, cMask: [] },
    vertex: { cMask: [] },
});

const resolveFieldBounds = (field: FieldDimensions) => {
    const innerHalfWidth = field.width / 2;
    const innerHalfHeight = field.height / 2;
    const inner: RectBounds = {
        leftX: -innerHalfWidth,
        rightX: innerHalfWidth,
        topY: -innerHalfHeight,
        bottomY: innerHalfHeight,
    };
    const outer: RectBounds = { ...inner };

    return { inner, outer };
};

const resolveGoalLines = (
    inner: RectBounds,
    endZones: StadiumMeasures["endZones"],
    goal: StadiumMeasures["goal"],
) => {
    const halfGoal = goal.width / 2;
    return {
        leftX: inner.leftX + endZones.depth,
        rightX: inner.rightX - endZones.depth,
        topY: -halfGoal,
        bottomY: halfGoal,
    };
};

const getFieldYards = (
    goalLines: ReturnType<typeof resolveGoalLines>,
    yardLength: number,
): number => {
    const span = goalLines.rightX - goalLines.leftX;
    const yards = span / yardLength;
    const roundedYards = Math.round(yards);

    if (Math.abs(yards - roundedYards) > 1e-9) {
        throw new Error(
            `Goal line span (${span}) is not divisible by yard length (${yardLength}).`,
        );
    }

    return roundedYards;
};

const buildYardLines = (
    goalLines: ReturnType<typeof resolveGoalLines>,
    innerField: RectBounds,
    yard: StadiumMeasures["yard"],
    colors: StadiumLineColors,
): LineSpec[] => {
    const fieldYards = getFieldYards(goalLines, yard.length);
    const { intervalYards, redZoneYards } = yard.lines;

    if (!Number.isInteger(fieldYards / intervalYards)) {
        throw new Error(
            `Field yards (${fieldYards}) must be divisible by yard line interval (${intervalYards}).`,
        );
    }

    const lines: LineSpec[] = [];

    for (let y = 0; y <= fieldYards; y += intervalYards) {
        const x = goalLines.leftX + y * yard.length;
        const isGoalLine = y === 0 || y === fieldYards;
        const isMidfield = y === fieldYards / 2;
        const isRedZone =
            redZoneYards !== undefined &&
            (y === redZoneYards || y === fieldYards - redZoneYards);

        const color = (() => {
            if (isGoalLine) return colors.yard.goal;
            if (isMidfield && colors.yard.midfield) return colors.yard.midfield;
            if (isRedZone && colors.yard.redZone) return colors.yard.redZone;
            return colors.yard.default;
        })();

        const ref = (() => {
            if (isGoalLine) return y === 0 ? "leftGoalLine" : "rightGoalLine";
            if (isMidfield) return "midfieldLine";
            return undefined;
        })();

        lines.push(
            vLine({
                x,
                yStart: innerField.topY,
                yEnd: innerField.bottomY,
                segment: { color, cMask: [] },
                vertex: { cMask: [] },
                ...(ref ? { ref } : {}),
            }),
        );
    }

    return lines;
};

const buildHashMarks = (
    goalLines: ReturnType<typeof resolveGoalLines>,
    yard: StadiumMeasures["yard"],
    hashMarks: StadiumMeasures["hashMarks"],
    color: string,
): LineSpec[] => {
    const fieldYards = getFieldYards(goalLines, yard.length);
    const { intervalYards } = yard.lines;
    const { subdivisionYards } = hashMarks;
    if (!Number.isInteger(intervalYards / subdivisionYards)) {
        throw new Error(
            `Yard line interval (${intervalYards}) must be divisible by hash subdivision (${subdivisionYards}).`,
        );
    }

    const marksPerSegment = intervalYards / subdivisionYards - 1;
    const segmentCount = fieldYards / intervalYards;
    const lines: LineSpec[] = [];
    let index = 0;
    const topBand = Math.max(hashMarks.bandTopY, hashMarks.bandBottomY);
    const bottomBand = Math.min(hashMarks.bandTopY, hashMarks.bandBottomY);
    const topStartY = topBand;
    const topEndY = topBand - hashMarks.markHeight;
    const bottomStartY = bottomBand + hashMarks.markHeight;
    const bottomEndY = bottomBand;

    for (let segment = 0; segment < segmentCount; segment += 1) {
        const segmentStart = segment * intervalYards;

        for (let mark = 1; mark <= marksPerSegment; mark += 1) {
            const yardFromLeft = segmentStart + mark * subdivisionYards;
            const x = goalLines.leftX + yardFromLeft * yard.length;

            lines.push(
                vLine({
                    x,
                    yStart: topStartY,
                    yEnd: topEndY,
                    segment: { color, cMask: [] },
                    vertex: { cMask: [] },
                    ref: `hashMarkTop${index}`,
                }),
            );
            lines.push(
                vLine({
                    x,
                    yStart: bottomStartY,
                    yEnd: bottomEndY,
                    segment: { color, cMask: [] },
                    vertex: { cMask: [] },
                    ref: `hashMarkBottom${index}`,
                }),
            );
            index += 1;
        }
    }

    return lines;
};

const buildTickMarks = (
    goalLines: ReturnType<typeof resolveGoalLines>,
    innerField: RectBounds,
    yard: StadiumMeasures["yard"],
    ticks: StadiumMeasures["ticks"],
    colors: StadiumLineColors,
): LineSpec[] => {
    if (!ticks) return [];

    const fieldYards = getFieldYards(goalLines, yard.length);
    const { intervalYards } = yard.lines;
    const topStartY = innerField.bottomY;
    const topEndY = innerField.bottomY - ticks.height;
    const bottomEndY = innerField.topY;
    const bottomStartY = innerField.topY + ticks.height;
    const tickXs: number[] = [];

    for (let y = 0; y <= fieldYards - intervalYards; y += intervalYards) {
        const yardFromLeft = y + ticks.offsetYards;
        tickXs.push(goalLines.leftX + yardFromLeft * yard.length);
    }

    const topGreen = new Set(ticks.greenTopYards ?? ticks.greenYards ?? []);
    const bottomGreen = new Set(
        ticks.greenBottomYards ?? ticks.greenYards ?? [],
    );

    return tickXs.flatMap((x, index) => {
        const tickYards = index * intervalYards + ticks.offsetYards;
        const topColor = topGreen.has(tickYards)
            ? (colors.tickGreen ?? colors.tick)
            : colors.tick;
        const bottomColor = bottomGreen.has(tickYards)
            ? (colors.tickGreen ?? colors.tick)
            : colors.tick;
        return [
            vLine({
                x,
                yStart: topStartY,
                yEnd: topEndY,
                segment: { color: topColor, cMask: [] },
                vertex: { cMask: [] },
                ref: `tickTop${index}`,
            }),
            vLine({
                x,
                yStart: bottomStartY,
                yEnd: bottomEndY,
                segment: { color: bottomColor, cMask: [] },
                vertex: { cMask: [] },
                ref: `tickBottom${index}`,
            }),
        ];
    });
};

const buildCollisionSidelines = (
    config: CollisionSidelineMeasures,
): LineSpec[] => [
    vLine({
        x: config.leftX,
        yStart: config.topY,
        yEnd: config.bottomY,
        segment: config.segment,
        ...(config.vertex ? { vertex: config.vertex } : {}),
    }),
    vLine({
        x: config.rightX,
        yStart: config.topY,
        yEnd: config.bottomY,
        segment: config.segment,
        ...(config.vertex ? { vertex: config.vertex } : {}),
    }),
];

const buildGoalPosts = (config: GoalPostMeasures): LineSpec[] => {
    const baseVertex = config.vertex;
    const toPoint = (point: Pair<number>) =>
        baseVertex
            ? { x: point[0], y: point[1], vertex: baseVertex }
            : { x: point[0], y: point[1] };

    return [
        vLine({
            x: config.leftX,
            yStart: config.topY,
            yEnd: config.bottomY,
            segment: config.segment,
            ...(config.vertex ? { vertex: config.vertex } : {}),
        }),
        vLine({
            x: config.rightX,
            yStart: config.topY,
            yEnd: config.bottomY,
            segment: config.segment,
            ...(config.vertex ? { vertex: config.vertex } : {}),
        }),
        ...(config.posts ?? []).map((segment) =>
            line({
                from: toPoint(segment.from),
                to: toPoint(segment.to),
                segment: config.segment,
            }),
        ),
    ];
};

const buildGoalPostDiscs = (config: GoalPostMeasures): Disc[] => {
    if (!config.disc) return [];
    return [
        { ...config.disc, pos: [config.leftX, config.topY] },
        { ...config.disc, pos: [config.leftX, config.bottomY] },
        { ...config.disc, pos: [config.rightX, config.topY] },
        { ...config.disc, pos: [config.rightX, config.bottomY] },
    ];
};

const buildBallBoundaries = (config: BallBoundaryMeasures): LineSpec[] => [
    vLine({
        x: config.leftX,
        yStart: config.topY,
        yEnd: config.bottomY,
        segment: config.leftSegment,
        ...(config.vertex ? { vertex: config.vertex } : {}),
    }),
    vLine({
        x: config.rightX,
        yStart: config.topY,
        yEnd: config.bottomY,
        segment: config.rightSegment,
        ...(config.vertex ? { vertex: config.vertex } : {}),
    }),
];

const buildMapMeasures = (
    measures: StadiumMeasures,
    features: StadiumFeatures | undefined,
    fieldBounds: { inner: RectBounds; outer: RectBounds },
    goalLines: ReturnType<typeof resolveGoalLines>,
): StadiumMapMeasures => {
    const yardLength = measures.yard.length;
    const redZoneDepth = (measures.yard.lines.redZoneYards ?? 0) * yardLength;
    const redZoneLeft = goalLines.leftX + redZoneDepth;
    const redZoneRight = goalLines.rightX - redZoneDepth;
    const bandTop = Math.min(
        measures.hashMarks.bandTopY,
        measures.hashMarks.bandBottomY,
    );
    const bandBottom = Math.max(
        measures.hashMarks.bandTopY,
        measures.hashMarks.bandBottomY,
    );

    const goalPosts = features?.goalPosts;
    const goalLineTopY = goalPosts?.topY ?? goalLines.topY;
    const goalLineBottomY = goalPosts?.bottomY ?? goalLines.bottomY;
    const redGoalX = goalPosts?.leftX ?? goalLines.leftX;
    const blueGoalX = goalPosts?.rightX ?? goalLines.rightX;
    const goalPostRadius = goalPosts?.disc?.radius ?? 0;

    return {
        END_ZONE_RED: {
            topLeft: { x: fieldBounds.outer.leftX, y: fieldBounds.inner.topY },
            bottomRight: {
                x: goalLines.leftX,
                y: fieldBounds.inner.bottomY,
            },
        },
        END_ZONE_BLUE: {
            topLeft: { x: fieldBounds.outer.rightX, y: fieldBounds.inner.topY },
            bottomRight: {
                x: goalLines.rightX,
                y: fieldBounds.inner.bottomY,
            },
        },
        RED_ZONE_RED: {
            topLeft: { x: goalLines.leftX, y: fieldBounds.inner.topY },
            bottomRight: { x: redZoneLeft, y: fieldBounds.inner.bottomY },
        },
        RED_ZONE_BLUE: {
            topLeft: { x: goalLines.rightX, y: fieldBounds.inner.topY },
            bottomRight: { x: redZoneRight, y: fieldBounds.inner.bottomY },
        },
        INNER_FIELD: {
            topLeft: { x: goalLines.leftX, y: fieldBounds.inner.topY },
            bottomRight: {
                x: goalLines.rightX,
                y: fieldBounds.inner.bottomY,
            },
        },
        OUTER_FIELD: {
            topLeft: { x: fieldBounds.outer.leftX, y: fieldBounds.outer.topY },
            bottomRight: {
                x: fieldBounds.outer.rightX,
                y: fieldBounds.outer.bottomY,
            },
        },
        RED_GOAL_LINE: {
            start: { x: redGoalX, y: goalLineTopY },
            end: { x: redGoalX, y: goalLineBottomY },
        },
        BLUE_GOAL_LINE: {
            start: { x: blueGoalX, y: goalLineTopY },
            end: { x: blueGoalX, y: goalLineBottomY },
        },
        GOAL_POST_RADIUS: goalPostRadius,
        HASHES_HEIGHT: {
            upperY: bandTop,
            lowerY: bandBottom,
        },
        SINGLE_HASH_HEIGHT: measures.hashMarks.markHeight,
        RED_END_ZONE_START_POSITION_X: goalLines.leftX,
        BLUE_END_ZONE_START_POSITION_X: goalLines.rightX,
        RED_END_ZONE_LINE_CENTER: { x: goalLines.leftX, y: 0 },
        BLUE_END_ZONE_LINE_CENTER: { x: goalLines.rightX, y: 0 },
        YARD: yardLength,
        HASH_SUBDIVISION:
            measures.hashMarks.subdivisionYards * measures.yard.length,
        YARDS_BETWEEN_0_MARK_AND_GOAL_LINE:
            measures.endZones.depth / yardLength,
    };
};

export const buildStadium = (
    options: BuildStadiumOptions,
): StadiumBuildResult => {
    const { measures, colors, schema, features } = options;
    const { name, size } = measures;
    const fieldBounds = resolveFieldBounds(measures.field);
    const goalLines = resolveGoalLines(
        fieldBounds.inner,
        measures.endZones,
        measures.goal,
    );

    const bg = {
        type: "grass" as const,
        width: fieldBounds.inner.rightX,
        height: fieldBounds.inner.bottomY,
    };

    const featureLines = [
        ...(features?.collisionSidelines
            ? buildCollisionSidelines(features.collisionSidelines)
            : []),
        ...(features?.goalPosts ? buildGoalPosts(features.goalPosts) : []),
        ...(features?.ballBoundaries
            ? buildBallBoundaries(features.ballBoundaries)
            : []),
    ];

    const featureDiscs = [
        ...(features?.goalPosts ? buildGoalPostDiscs(features.goalPosts) : []),
        ...(features?.discs ?? []),
    ];

    const lines = [
        ...buildYardLines(goalLines, fieldBounds.inner, measures.yard, colors),
        ...buildHashMarks(
            goalLines,
            measures.yard,
            measures.hashMarks,
            colors.hash,
        ),
        ...buildTickMarks(
            goalLines,
            fieldBounds.inner,
            measures.yard,
            measures.ticks,
            colors,
        ),
        ...featureLines,
        ...(schema?.lines ?? []),
    ];

    const rects = [
        buildFieldBounds(fieldBounds.inner, colors.yard.default),
        ...(schema?.rects ?? []),
    ];

    const planes = [...(features?.planes ?? []), ...(schema?.planes ?? [])];
    const discs = [...featureDiscs, ...(schema?.discs ?? [])];

    const builtSchema: StadiumSchema = {
        name,
        width: size.width,
        height: size.height,
        bg,
        goals: [],
        redSpawnPoints: [],
        blueSpawnPoints: [],
        traits: {},
        ...schema,
        lines,
        rects,
        planes,
        discs,
    };

    const mapMeasures = buildMapMeasures(
        measures,
        features,
        fieldBounds,
        goalLines,
    );

    const stadiumResult = defineStadium(builtSchema);

    return {
        ...stadiumResult,
        mapMeasures,
    };
};
