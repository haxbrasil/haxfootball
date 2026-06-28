import type {
    AnchorSpec,
    JointSpec,
    LineSpec,
    SegmentProps,
    VertexProps,
} from "@common/stadium-generator";
import { asArray, mergeDeep, repeat } from "@common/general/helpers";
import type { DeepPartial, Pair } from "@common/general/types";
import { range } from "@common/math/geometry";

type LinePoint = { x: number; y: number; vertex?: VertexProps };

type ExtendInput<T> = DeepPartial<T> & {
    extend?: ExtendInput<T> | ExtendInput<T>[];
};

type LineParamsCore = {
    from: LinePoint;
    to: LinePoint;
    segment: SegmentProps;
    ref?: string;
};

const stripExtend = <T extends Record<string, unknown>>(
    value: ExtendInput<T>,
): Partial<T> => {
    const { extend: _extend, ...rest } = value as Record<string, unknown>;

    return rest as Partial<T>;
};

const resolveExtend = <T extends Record<string, unknown>>(
    input: ExtendInput<T>,
): T => {
    const bases = asArray(input.extend);

    const mergedBase = bases.reduce<T>(
        (acc, base) => mergeDeep(acc, resolveExtend(base as ExtendInput<T>)),
        {} as T,
    );

    return mergeDeep(mergedBase, stripExtend(input) as Partial<T>);
};

export function line(params: ExtendInput<LineParamsCore>): LineSpec;
export function line(
    from: LinePoint,
    to: LinePoint,
    segment: SegmentProps,
    ref?: string,
): LineSpec;
export function line(
    fromOrParams: LinePoint | ExtendInput<LineParamsCore>,
    to?: LinePoint,
    segment?: SegmentProps,
    ref?: string,
): LineSpec {
    if (typeof to === "undefined" && "from" in fromOrParams) {
        const resolved = resolveExtend<LineParamsCore>(
            fromOrParams as ExtendInput<LineParamsCore>,
        );

        const { from, to: target, segment: seg, ref: reference } = resolved;

        if (!from || !target || !seg) {
            throw new Error(
                "line params require from, to, and segment (via params or extend)",
            );
        }

        return {
            ...(reference ? { ref: reference } : {}),
            from,
            to: target,
            segment: seg,
        };
    }

    if (!to || !segment) {
        throw new Error(
            "line requires either a params object or full arguments",
        );
    }

    return {
        ...(ref ? { ref } : {}),
        from: fromOrParams as LinePoint,
        to,
        segment,
    };
}

type VLineParamsCore = {
    x: number;
    yStart: number;
    yEnd: number;
    segment: SegmentProps;
    ref?: string;
    vertex?: VertexProps;
};

export const vLine = (params: ExtendInput<VLineParamsCore>): LineSpec => {
    const resolved = resolveExtend<VLineParamsCore>(params);
    const { x, yStart, yEnd, segment, ref, vertex } = resolved;

    if (
        x === undefined ||
        yStart === undefined ||
        yEnd === undefined ||
        !segment
    ) {
        throw new Error(
            "vLine params require x, yStart, yEnd, and segment (via params or extend)",
        );
    }

    return line(
        vertex ? { x, y: yStart, vertex } : { x, y: yStart },
        vertex ? { x, y: yEnd, vertex } : { x, y: yEnd },
        segment,
        ref,
    );
};

type PairedIndexesParams = {
    start: number;
    count: number;
};

export const pairedIndexes = ({
    start,
    count,
}: PairedIndexesParams): Array<Pair<number>> =>
    repeat(count, (index) => {
        const left = start + index * 2;
        return [left, left + 1];
    });

type AnchorsFromPairsParams = {
    prefix: string;
    pairs: Array<Pair<number>>;
};

export const anchorsFromPairs = ({
    prefix,
    pairs,
}: AnchorsFromPairsParams): AnchorSpec[] =>
    pairs.flatMap(([d0, d1], index) => [
        { ref: `${prefix}${index}.a`, index: d0 },
        { ref: `${prefix}${index}.b`, index: d1 },
    ]);

type JointsFromPairsParams = {
    prefix: string;
    pairs: Array<Pair<number>>;
    color: string;
};

export const jointsFromPairs = ({
    prefix,
    pairs,
    color,
}: JointsFromPairsParams): JointSpec[] =>
    pairs.map((_, index) => ({
        ref: `${prefix}${index}`,
        from: `${prefix}${index}.a`,
        to: `${prefix}${index}.b`,
        color,
        length: range(0, 99999),
    }));
