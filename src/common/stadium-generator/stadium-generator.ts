import type {
    Disc,
    Joint,
    Plane,
    Segment,
    StadiumObject,
    Vertex,
} from "@haxball/stadium";
import type { Pair } from "@common/general/types";

export type VertexProps = Omit<Vertex, "x" | "y">;
export type SegmentProps = Omit<Segment, "v0" | "v1">;
export type PlaneProps = Omit<Plane, "normal" | "dist">;
export type JointProps = Omit<Joint, "d0" | "d1">;

export type PointSpec = {
    x: number;
    y: number;
    vertex?: VertexProps;
};

export type NamedPointSpec = PointSpec & {
    name: string;
    tags?: string[];
};

export type PointRef = string | PointSpec;

export type LineSpec = {
    name?: string;
    from: PointRef;
    to: PointRef;
    segment?: SegmentProps;
    tags?: string[];
};

export type RectSpec = {
    name?: string;
    x: Pair<number>;
    y: Pair<number>;
    segment?: SegmentProps;
    vertex?: VertexProps;
    tags?: string[];
};

export type PlaneSide = "left" | "right" | "above" | "below";
export type RectPlaneSide = "inside" | "outside";

type LineRef = string | { start: PointSpec; end: PointSpec };
type RectRef = string | RectSpec;

export type PlaneSpec =
    | ({ normal: Pair<number>; dist: number } & PlaneProps & {
              name?: string;
              tags?: string[];
          })
    | {
          line: LineRef;
          side: PlaneSide;
          props?: PlaneProps;
          name?: string;
          tags?: string[];
      }
    | {
          rect: RectRef;
          side: RectPlaneSide;
          props?: PlaneProps;
          name?: string;
          tags?: string[];
      };

export type AnchorSpec =
    | { name: string; index: number; tags?: string[] }
    | { name: string; disc: Disc; tags?: string[] };

export type DynamicLineSpec = {
    name: string;
    joint: JointProps;
    disc?: Partial<Disc>;
    endpoints?: {
        a?: Partial<Disc>;
        b?: Partial<Disc>;
    };
    tags?: string[];
};

export type JointSpec =
    | ({
          from: string;
          to: string;
      } & JointProps & { name?: string; tags?: string[] })
    | ({
          d0: number;
          d1: number;
      } & JointProps & { name?: string; tags?: string[] });

export type StadiumSchema = Omit<
    StadiumObject,
    "vertexes" | "segments" | "planes" | "joints" | "discs"
> & {
    points?: NamedPointSpec[];
    lines?: LineSpec[];
    rects?: RectSpec[];
    planes?: PlaneSpec[];
    discs?: Disc[];
    anchors?: AnchorSpec[];
    dynamicLines?: DynamicLineSpec[];
    joints?: JointSpec[];
    vertexes?: Vertex[];
    segments?: Segment[];
    tags?: Record<string, string[]>;
};

export type StadiumIndex = {
    names: {
        vertexes: Record<string, number>;
        segments: Record<string, number>;
        planes: Record<string, number>;
        discs: Record<string, number>;
        joints: Record<string, number>;
    };
    tags: {
        vertexes: Record<string, number[]>;
        segments: Record<string, number[]>;
        planes: Record<string, number[]>;
        discs: Record<string, number[]>;
        joints: Record<string, number[]>;
    };
    dynamicLines: {
        names: Record<string, Pair<number>>;
        tags: Record<string, Array<Pair<number>>>;
    };
};

export type StadiumBuild = {
    stadium: StadiumObject;
    index: StadiumIndex;
};

type NamedLine = LineSpec & { name: string };
type NamedRect = RectSpec & { name: string };

const asNamedLines = (lines: LineSpec[] = []) =>
    lines.filter((line): line is NamedLine => Boolean(line.name));

const asNamedRects = (rects: RectSpec[] = []) =>
    rects.filter((rect): rect is NamedRect => Boolean(rect.name));

const pointKey = (point: PointSpec) =>
    JSON.stringify({
        x: point.x,
        y: point.y,
        vertex: point.vertex ?? null,
    });

const ensureAxisAligned = (
    start: PointSpec,
    end: PointSpec,
    context: string,
) => {
    const isVertical = start.x === end.x;
    const isHorizontal = start.y === end.y;

    if (!isVertical && !isHorizontal) {
        throw new Error(`${context} requires an axis-aligned line`);
    }
};

const planeFromVerticalLine = (
    x: number,
    side: PlaneSide,
): { normal: Pair<number>; dist: number } => {
    if (side === "left") return { normal: [1, 0], dist: x };
    if (side === "right") return { normal: [-1, 0], dist: -x };

    throw new Error(`Invalid plane side "${side}" for vertical line`);
};

const planeFromHorizontalLine = (
    y: number,
    side: PlaneSide,
): { normal: Pair<number>; dist: number } => {
    if (side === "above") return { normal: [0, 1], dist: y };
    if (side === "below") return { normal: [0, -1], dist: -y };

    throw new Error(`Invalid plane side "${side}" for horizontal line`);
};

const planesFromRect = (
    rect: RectSpec,
    side: RectPlaneSide,
): Array<{ normal: Pair<number>; dist: number }> => {
    const [x1, x2] = rect.x;
    const [y1, y2] = rect.y;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    if (side === "outside") {
        return [
            { normal: [1, 0], dist: minX },
            { normal: [-1, 0], dist: -maxX },
            { normal: [0, 1], dist: minY },
            { normal: [0, -1], dist: -maxY },
        ];
    }

    return [
        { normal: [-1, 0], dist: -minX },
        { normal: [1, 0], dist: maxX },
        { normal: [0, -1], dist: -minY },
        { normal: [0, 1], dist: maxY },
    ];
};

const resolvePointRef = (
    ref: PointRef,
    pointIndex: Map<string, number>,
    inlineIndex: Map<string, number>,
    inlineVertexes: Vertex[],
    pointBaseCount: number,
): number => {
    if (typeof ref === "string") {
        const index = pointIndex.get(ref);

        if (index === undefined) {
            throw new Error(`Unknown stadium point: ${ref}`);
        }

        return index;
    }

    const key = pointKey(ref);
    const existing = inlineIndex.get(key);

    if (existing !== undefined) {
        return existing;
    }

    const index = pointBaseCount + inlineVertexes.length;

    inlineIndex.set(key, index);
    inlineVertexes.push({
        x: ref.x,
        y: ref.y,
        ...ref.vertex,
    });

    return index;
};

const resolveLineRef = (
    ref: LineRef,
    namedLines: Map<string, NamedLine>,
    pointMap: Map<string, NamedPointSpec>,
): { start: PointSpec; end: PointSpec } => {
    if (typeof ref === "string") {
        const line = namedLines.get(ref);

        if (!line) {
            throw new Error(`Unknown stadium line: ${ref}`);
        }

        const start =
            typeof line.from === "string" ? pointMap.get(line.from) : line.from;

        const end =
            typeof line.to === "string" ? pointMap.get(line.to) : line.to;

        if (!start) {
            throw new Error(`Unknown stadium point: ${line.from}`);
        }

        if (!end) {
            throw new Error(`Unknown stadium point: ${line.to}`);
        }

        return { start, end };
    }

    return ref;
};

const resolveRectRef = (
    ref: RectRef,
    namedRects: Map<string, NamedRect>,
): RectSpec => {
    if (typeof ref === "string") {
        const rect = namedRects.get(ref);

        if (!rect) {
            throw new Error(`Unknown stadium rect: ${ref}`);
        }

        return rect;
    }

    return ref;
};

const rectToLines = (rect: RectSpec): LineSpec[] => {
    const [x1, x2] = rect.x;
    const [y1, y2] = rect.y;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const vertex = rect.vertex;
    const segment = rect.segment;
    const base = {
        ...(segment ? { segment } : {}),
        ...(rect.tags ? { tags: rect.tags } : {}),
    };
    const point = (x: number, y: number) =>
        vertex ? { x, y, vertex } : { x, y };
    const named = (suffix: string) =>
        rect.name ? { name: `${rect.name}.${suffix}` } : {};

    return [
        {
            ...named("top"),
            ...base,
            from: point(minX, minY),
            to: point(maxX, minY),
        },
        {
            ...named("right"),
            ...base,
            from: point(maxX, minY),
            to: point(maxX, maxY),
        },
        {
            ...named("bottom"),
            ...base,
            from: point(maxX, maxY),
            to: point(minX, maxY),
        },
        {
            ...named("left"),
            ...base,
            from: point(minX, maxY),
            to: point(minX, minY),
        },
    ];
};

const createStadiumIndex = (): StadiumIndex => ({
    names: {
        vertexes: {},
        segments: {},
        planes: {},
        discs: {},
        joints: {},
    },
    tags: {
        vertexes: {},
        segments: {},
        planes: {},
        discs: {},
        joints: {},
    },
    dynamicLines: {
        names: {},
        tags: {},
    },
});

const setIndexName = (
    target: Record<string, number>,
    name: string | undefined,
    index: number,
    kind: string,
) => {
    if (!name) return;

    if (name in target) {
        throw new Error(`Duplicate stadium ${kind} name: ${name}`);
    }

    target[name] = index;
};

const addIndexTags = (
    target: Record<string, number[]>,
    tags: string[] | undefined,
    index: number,
) => {
    if (!tags || tags.length === 0) return;

    tags.forEach((tag) => {
        const bucket = target[tag];

        if (bucket) {
            bucket.push(index);
            return;
        }

        target[tag] = [index];
    });
};

const addIndexPairTags = (
    target: Record<string, Array<Pair<number>>>,
    tags: string[] | undefined,
    pair: Pair<number>,
) => {
    if (!tags || tags.length === 0) return;

    tags.forEach((tag) => {
        const bucket = target[tag];

        if (bucket) {
            bucket.push(pair);
            return;
        }

        target[tag] = [pair];
    });
};

const rectPlaneSuffixes = ["left", "right", "top", "bottom"] as const;

const DEFAULT_DYNAMIC_LINE_DISC: Disc = {
    radius: 0,
    invMass: 1,
    pos: [0, 0],
    color: "transparent",
    cGroup: [],
};

const DEFAULT_DYNAMIC_LINE_LENGTH: Pair<number> = [0, 99999];

const buildStadium = (schema: StadiumSchema): StadiumBuild => {
    const {
        points = [],
        lines = [],
        rects = [],
        planes = [],
        discs = [],
        anchors = [],
        dynamicLines = [],
        joints = [],
        vertexes = [],
        segments = [],
        tags: _tags,
        ...rest
    } = schema;
    const jointDiscOffset = rest.ballPhysics === "disc0" ? 0 : 1;

    const stadiumIndex = createStadiumIndex();
    const namedRects = new Map<string, NamedRect>();

    asNamedRects(rects).forEach((rect) => {
        if (namedRects.has(rect.name)) {
            throw new Error(`Duplicate stadium rect name: ${rect.name}`);
        }
        namedRects.set(rect.name, rect);
    });

    const pointNameIndex = new Map<string, number>();
    const pointMap = new Map<string, NamedPointSpec>();
    const baseVertexes = points.map((point, pointIdx) => {
        if (pointNameIndex.has(point.name)) {
            throw new Error(`Duplicate stadium point name: ${point.name}`);
        }

        pointNameIndex.set(point.name, pointIdx);
        pointMap.set(point.name, point);

        setIndexName(
            stadiumIndex.names.vertexes,
            point.name,
            pointIdx,
            "point",
        );

        addIndexTags(stadiumIndex.tags.vertexes, point.tags, pointIdx);

        return {
            x: point.x,
            y: point.y,
            ...point.vertex,
        };
    });

    const inlineIndex = new Map<string, number>();
    const inlineVertexes: Vertex[] = [];
    const allLines = [...lines, ...rects.flatMap(rectToLines)];
    const namedLines = new Map<string, NamedLine>();

    asNamedLines(allLines).forEach((line) => {
        if (namedLines.has(line.name)) {
            throw new Error(`Duplicate stadium line name: ${line.name}`);
        }

        namedLines.set(line.name, line);
    });

    const builtSegments = allLines.map((line, segmentIndex) => {
        const v0 = resolvePointRef(
            line.from,
            pointNameIndex,
            inlineIndex,
            inlineVertexes,
            baseVertexes.length,
        );

        const v1 = resolvePointRef(
            line.to,
            pointNameIndex,
            inlineIndex,
            inlineVertexes,
            baseVertexes.length,
        );

        setIndexName(
            stadiumIndex.names.segments,
            line.name,
            segmentIndex,
            "line",
        );

        addIndexTags(stadiumIndex.tags.segments, line.tags, segmentIndex);

        return {
            v0,
            v1,
            ...line.segment,
        };
    });

    const allVertexes = [...baseVertexes, ...inlineVertexes, ...vertexes];
    const allSegments = [...builtSegments, ...segments];

    const anchorIndex = new Map<string, number>();
    const builtDiscs = [...discs];

    const dynamicLineJoints: JointSpec[] = [];

    dynamicLines.forEach((line) => {
        if (line.name in stadiumIndex.dynamicLines.names) {
            throw new Error(`Duplicate dynamic line name: ${line.name}`);
        }

        const discA: Disc = {
            ...DEFAULT_DYNAMIC_LINE_DISC,
            ...line.disc,
            ...line.endpoints?.a,
        };
        const discB: Disc = {
            ...DEFAULT_DYNAMIC_LINE_DISC,
            ...line.disc,
            ...line.endpoints?.b,
        };

        const d0 = builtDiscs.length;
        builtDiscs.push(discA);
        const d1 = builtDiscs.length;
        builtDiscs.push(discB);

        const { length, ...jointProps } = line.joint;
        dynamicLineJoints.push({
            d0,
            d1,
            length: length ?? DEFAULT_DYNAMIC_LINE_LENGTH,
            ...jointProps,
        });

        const pair: Pair<number> = [d0, d1];
        stadiumIndex.dynamicLines.names[line.name] = pair;
        addIndexPairTags(stadiumIndex.dynamicLines.tags, line.tags, pair);
    });

    anchors.forEach((anchor) => {
        if (anchorIndex.has(anchor.name)) {
            throw new Error(`Duplicate stadium anchor name: ${anchor.name}`);
        }

        if ("index" in anchor) {
            anchorIndex.set(anchor.name, anchor.index);

            setIndexName(
                stadiumIndex.names.discs,
                anchor.name,
                anchor.index,
                "anchor",
            );

            addIndexTags(stadiumIndex.tags.discs, anchor.tags, anchor.index);

            return;
        }

        const discIndex = builtDiscs.length;

        builtDiscs.push(anchor.disc);
        anchorIndex.set(anchor.name, discIndex);

        setIndexName(
            stadiumIndex.names.discs,
            anchor.name,
            discIndex,
            "anchor",
        );

        addIndexTags(stadiumIndex.tags.discs, anchor.tags, discIndex);
    });

    const allJoints = [...dynamicLineJoints, ...joints];

    const builtJoints = allJoints.flatMap((entry) => {
        if ("from" in entry) {
            const d0 = anchorIndex.get(entry.from);
            const d1 = anchorIndex.get(entry.to);

            if (d0 === undefined) {
                throw new Error(`Unknown stadium anchor: ${entry.from}`);
            }

            if (d1 === undefined) {
                throw new Error(`Unknown stadium anchor: ${entry.to}`);
            }

            const {
                from: _from,
                to: _to,
                name: _name,
                tags: _tags,
                ...rest
            } = entry;

            return [
                {
                    d0: d0 + jointDiscOffset,
                    d1: d1 + jointDiscOffset,
                    ...rest,
                },
            ];
        }

        const { d0, d1, name: _name, tags: _tags, ...rest } = entry;

        return [
            {
                d0: d0 + jointDiscOffset,
                d1: d1 + jointDiscOffset,
                ...rest,
            },
        ];
    });

    const planeBuilds: Array<{ plane: Plane; name?: string; tags?: string[] }> =
        [];

    planes.forEach((entry) => {
        if ("normal" in entry && "dist" in entry) {
            const { normal, dist, name, tags, ...rest } = entry;

            planeBuilds.push({
                plane: {
                    normal,
                    dist,
                    ...rest,
                },
                ...(name ? { name } : {}),
                ...(tags ? { tags } : {}),
            });

            return;
        }

        if ("line" in entry) {
            const { props, side, name, tags } = entry;
            const line = resolveLineRef(entry.line, namedLines, pointMap);

            ensureAxisAligned(line.start, line.end, "Plane from line");

            if (line.start.x === line.end.x) {
                const plane = planeFromVerticalLine(line.start.x, side);

                planeBuilds.push({
                    plane: {
                        ...plane,
                        ...props,
                    },
                    ...(name ? { name } : {}),
                    ...(tags ? { tags } : {}),
                });

                return;
            }

            const plane = planeFromHorizontalLine(line.start.y, side);

            planeBuilds.push({
                plane: {
                    ...plane,
                    ...props,
                },
                ...(name ? { name } : {}),
                ...(tags ? { tags } : {}),
            });

            return;
        }

        const { props, side, name, tags } = entry;
        const rect = resolveRectRef(entry.rect, namedRects);

        planesFromRect(rect, side).forEach((plane, planeIndex) => {
            const derivedName = name
                ? `${name}.${rectPlaneSuffixes[planeIndex]}`
                : undefined;

            planeBuilds.push({
                plane: {
                    ...plane,
                    ...props,
                },
                ...(derivedName ? { name: derivedName } : {}),
                ...(tags ? { tags } : {}),
            });
        });
    });

    const builtPlanes = planeBuilds.map(({ plane }) => plane);

    planeBuilds.forEach((entry, planeIndex) => {
        setIndexName(
            stadiumIndex.names.planes,
            entry.name,
            planeIndex,
            "plane",
        );

        addIndexTags(stadiumIndex.tags.planes, entry.tags, planeIndex);
    });

    builtJoints.forEach((_, jointIndex) => {
        const entry = allJoints[jointIndex];

        if (!entry) return;

        setIndexName(
            stadiumIndex.names.joints,
            entry.name,
            jointIndex,
            "joint",
        );

        addIndexTags(stadiumIndex.tags.joints, entry.tags, jointIndex);
    });

    return {
        stadium: {
            ...rest,
            ...(allVertexes.length > 0 ? { vertexes: allVertexes } : {}),
            ...(allSegments.length > 0 ? { segments: allSegments } : {}),
            ...(builtPlanes.length > 0 ? { planes: builtPlanes } : {}),
            ...(builtDiscs.length > 0 ? { discs: builtDiscs } : {}),
            ...(builtJoints.length > 0 ? { joints: builtJoints } : {}),
        },
        index: stadiumIndex,
    };
};

export function defineStadium(schema: StadiumSchema): StadiumBuild {
    return buildStadium(schema);
}
