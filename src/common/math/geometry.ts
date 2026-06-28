import type { Pair } from "@common/general/types";

export type Point = { x: number; y: number };

export type PointLike = Point & { radius?: number | null };

export type VelocityLike = { xspeed: number; yspeed: number };

export type Bounds = {
    left: number;
    right: number;
    top: number;
    bottom: number;
};

export interface Line {
    start: Point;
    end: Point;
}

export const pos = (x: number, y: number): Pair<number> => [x, y];
export const range = (min: number, max: number): Pair<number> => [min, max];

export interface Ray {
    origin: Point;
    direction: Point;
}

export type LineDistributionMode =
    | "space-between"
    | "space-around"
    | "space-evenly";

export interface DistributePointLikesOptions {
    mode?: LineDistributionMode;
}

export function getDistance(a: PointLike, b: PointLike): number {
    const center = getPointDistance(a, b);

    const ar = typeof a.radius === "number" ? a.radius : 0;
    const br = typeof b.radius === "number" ? b.radius : 0;

    const surfaceDistance = center - ar - br;

    return surfaceDistance > 0 ? surfaceDistance : 0;
}

export function getPointDistance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export function getPointDistanceSquared(a: Point, b: Point): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;

    return dx * dx + dy * dy;
}

export function getSpeed(velocity: VelocityLike): number {
    return Math.hypot(velocity.xspeed, velocity.yspeed);
}

export function getSpeedSquared(velocity: VelocityLike): number {
    return (
        velocity.xspeed * velocity.xspeed + velocity.yspeed * velocity.yspeed
    );
}

export function getPointSegmentDistance(
    point: Point,
    start: Point,
    end: Point,
): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
        return getPointDistance(point, start);
    }

    const projection =
        ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq;
    const factor = Math.max(0, Math.min(1, projection));
    const closest = {
        x: start.x + dx * factor,
        y: start.y + dy * factor,
    };

    return getPointDistance(point, closest);
}

export function isContainedInBounds(point: PointLike, bounds: Bounds): boolean {
    const minX = Math.min(bounds.left, bounds.right);
    const maxX = Math.max(bounds.left, bounds.right);
    const minY = Math.min(bounds.top, bounds.bottom);
    const maxY = Math.max(bounds.top, bounds.bottom);
    const radius = Math.max(0, point.radius ?? 0);

    return (
        point.x - radius >= minX &&
        point.x + radius <= maxX &&
        point.y - radius >= minY &&
        point.y + radius <= maxY
    );
}

export function getMidpoint(a: PointLike, b: PointLike): PointLike {
    const radiusA = typeof a.radius === "number" ? a.radius : null;
    const radiusB = typeof b.radius === "number" ? b.radius : null;
    let radius: number | null = null;

    if (radiusA !== null && radiusB !== null) {
        radius = (radiusA + radiusB) / 2;
    } else if (radiusA !== null) {
        radius = radiusA;
    } else if (radiusB !== null) {
        radius = radiusB;
    }

    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        radius,
    };
}

export function findClosest<T extends PointLike>(
    target: PointLike,
    points: T[],
): T | null {
    if (points.length === 0) return null;

    return points.reduce<T | null>((closest, point) => {
        if (!closest) return point;

        const closestDistance = getDistance(closest, target);
        const pointDistance = getDistance(point, target);

        return pointDistance < closestDistance ? point : closest;
    }, null);
}

export function verticalLine(x: number, centerY: number, height: number): Line {
    const halfHeight = height / 2;
    return {
        start: { x, y: centerY - halfHeight },
        end: { x, y: centerY + halfHeight },
    };
}

export function distributeOnLine<T extends PointLike>(
    points: T[],
    line: { start: PointLike; end: PointLike },
    options?: DistributePointLikesOptions,
): T[] {
    const count = points.length;

    if (count === 0) return [];

    const start = line.start;
    const end = line.end;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    if (length === 0) {
        return points.map((point) => ({
            ...point,
            x: start.x,
            y: start.y,
        }));
    }

    const dirX = dx / length;
    const dirY = dy / length;
    const radii = points.map((point) => Math.max(0, point.radius ?? 0));
    const totalDiameter = radii.reduce((sum, radius) => sum + radius * 2, 0);
    const available = Math.max(0, length - totalDiameter);
    const mode = options?.mode ?? "space-evenly";

    let gapStart: number;
    let gapBetween: number;

    if (count === 1) {
        const gap = available / 2;
        gapStart = gap;
        gapBetween = 0;
    } else {
        const baseGap = (() => {
            switch (mode) {
                case "space-between":
                    return available / Math.max(1, count - 1);
                case "space-around":
                    return available / (count * 2);
                case "space-evenly":
                default:
                    return available / (count + 1);
            }
        })();

        switch (mode) {
            case "space-between":
                gapStart = 0;
                gapBetween = baseGap;
                break;
            case "space-around":
                gapStart = baseGap;
                gapBetween = baseGap * 2;
                break;
            case "space-evenly":
            default:
                gapStart = baseGap;
                gapBetween = baseGap;
                break;
        }
    }

    const firstRadius = radii[0] ?? 0;
    let cursor = gapStart + firstRadius;

    return points.map((point, index) => {
        const x = start.x + dirX * cursor;
        const y = start.y + dirY * cursor;
        const leftRadius = radii[index] ?? 0;
        const rightRadius = radii[index + 1] ?? 0;
        const next =
            index < count - 1 ? leftRadius + gapBetween + rightRadius : 0;

        cursor += next;

        return {
            ...point,
            x,
            y,
        };
    });
}

type Coordinate = Pair<number>;
type Direction = 1 | -1;
type Extension = Pair<number>;
type DashSegment<T> = readonly [T, T];
type Corners<T> = readonly [T, T, T, T];
type PlacedVertex<T> = readonly [T, number, number];

export function dashedRectangleFromSegments<T>(
    segments: readonly DashSegment<T>[],
    corners: Corners<T>,
    start: Coordinate,
    direction: Direction,
    extension: Extension,
    dashSize: number,
): PlacedVertex<T>[] {
    const [xStart, yMid] = start;
    const [wRaw, hRaw] = extension;

    const w = Math.abs(wRaw);
    const h = Math.abs(hRaw);

    if (!Number.isFinite(dashSize) || dashSize <= 0) {
        throw new Error(`dashSize must be > 0. Got: ${dashSize}`);
    }

    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
        throw new Error(`extension must be positive. Got: [${wRaw}, ${hRaw}]`);
    }

    const xOpp = xStart + direction * w;
    const yTop = yMid - h / 2;
    const yBot = yMid + h / 2;

    const posById = new Map<T, Pair<number>>();

    const setPos = (id: T, p: Pair<number>) => {
        const prev = posById.get(id);
        if (!prev) {
            posById.set(id, p);
            return;
        }
        if (prev[0] !== p[0] || prev[1] !== p[1]) {
            throw new Error(
                `Vertex ${id} appears multiple times with different positions: ` +
                    `[${prev[0]}, ${prev[1]}] vs [${p[0]}, ${p[1]}]`,
            );
        }
    };

    const [c0, c1, c2, c3] = corners;

    setPos(c0, [xStart, yTop]);
    setPos(c1, [xOpp, yTop]);
    setPos(c2, [xOpp, yBot]);
    setPos(c3, [xStart, yBot]);

    // Distribute segments across all 4 sides as evenly as possible
    const segmentsPerSide = segments.length / 4;
    const extraSegments = segments.length % 4;
    const sideLength = [h, w, h, w]; // left, top, right, bottom

    let segmentIndex = 0;
    for (let side = 0; side < 4; side++) {
        // Give extra segments to first sides to distribute evenly
        const segmentsOnThisSide =
            Math.floor(segmentsPerSide) + (side < extraSegments ? 1 : 0);

        if (segmentsOnThisSide === 0) continue;

        const sideLen = sideLength[side]!;

        // Calculate spacing to center segments on this side
        const totalDashOnSide = segmentsOnThisSide * dashSize;
        const gapOnSide =
            (sideLen - totalDashOnSide) / (segmentsOnThisSide + 1);

        for (let i = 0; i < segmentsOnThisSide; i++) {
            if (segmentIndex >= segments.length) break;

            const segment = segments[segmentIndex];
            if (!segment) break;
            const [a, b] = segment;
            const localStart = gapOnSide + i * (dashSize + gapOnSide);
            const localEnd = localStart + dashSize;

            // Calculate positions based on which side we're on
            if (side === 0) {
                // Left side (vertical)
                setPos(a, [xStart, yMid - h / 2 + localStart]);
                setPos(b, [xStart, yMid - h / 2 + localEnd]);
            } else if (side === 1) {
                // Top side (horizontal)
                setPos(a, [xStart + direction * localStart, yTop]);
                setPos(b, [xStart + direction * localEnd, yTop]);
            } else if (side === 2) {
                // Right side (vertical)
                setPos(a, [xOpp, yTop + localStart]);
                setPos(b, [xOpp, yTop + localEnd]);
            } else {
                // Bottom side (horizontal)
                setPos(a, [xOpp - direction * localStart, yBot]);
                setPos(b, [xOpp - direction * localEnd, yBot]);
            }

            segmentIndex++;
        }
    }

    const out: PlacedVertex<T>[] = [];

    for (const [a, b] of segments) {
        const pa = posById.get(a)!;
        const pb = posById.get(b)!;
        out.push([a, pa[0], pa[1]], [b, pb[0], pb[1]]);
    }

    {
        const p0 = posById.get(c0)!;
        const p1 = posById.get(c1)!;
        const p2 = posById.get(c2)!;
        const p3 = posById.get(c3)!;

        out.push(
            [c0, p0[0], p0[1]],
            [c1, p1[0], p1[1]],
            [c2, p2[0], p2[1]],
            [c3, p3[0], p3[1]],
        );
    }

    return out;
}

export function intersectsRectangle(
    p: PointLike,
    start: Coordinate,
    direction: Direction,
    extension: Extension,
): boolean {
    const [xStart, yMid] = start;
    const [wRaw, hRaw] = extension;

    const w = Math.abs(wRaw);
    const h = Math.abs(hRaw);

    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
        throw new Error(`extension must be positive. Got: [${wRaw}, ${hRaw}]`);
    }

    const xOpp = xStart + direction * w;
    const xMin = Math.min(xStart, xOpp);
    const xMax = Math.max(xStart, xOpp);

    const yTop = yMid - h / 2;
    const yBot = yMid + h / 2;
    const yMin = Math.min(yTop, yBot);
    const yMax = Math.max(yTop, yBot);

    const r0 = p.radius ?? 0;
    const r = Number.isFinite(r0) ? Math.max(0, r0) : 0;

    if (r === 0) {
        return p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax;
    }

    const clamp = (v: number, lo: number, hi: number) =>
        v < lo ? lo : v > hi ? hi : v;

    const cx = clamp(p.x, xMin, xMax);
    const cy = clamp(p.y, yMin, yMax);

    const dx = p.x - cx;
    const dy = p.y - cy;

    return dx * dx + dy * dy <= r * r;
}

export function isContainedInRectangle(
    p: PointLike,
    start: Coordinate,
    direction: Direction,
    extension: Extension,
): boolean {
    const [xStart, yMid] = start;
    const [wRaw, hRaw] = extension;

    const w = Math.abs(wRaw);
    const h = Math.abs(hRaw);

    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
        throw new Error(`extension must be positive. Got: [${wRaw}, ${hRaw}]`);
    }

    const xOpp = xStart + direction * w;
    const xMin = Math.min(xStart, xOpp);
    const xMax = Math.max(xStart, xOpp);

    const yTop = yMid - h / 2;
    const yBot = yMid + h / 2;
    const yMin = Math.min(yTop, yBot);
    const yMax = Math.max(yTop, yBot);

    const r0 = p.radius ?? 0;
    const r = Number.isFinite(r0) ? Math.max(0, r0) : 0;

    return (
        p.x - r >= xMin && p.x + r <= xMax && p.y - r >= yMin && p.y + r <= yMax
    );
}
