import { Pair } from "./types";

export const pair = <T>(left: T, right: T): Pair<T> => [left, right];

export const asArray = <T>(value?: T | T[]): T[] =>
    value === undefined ? [] : Array.isArray(value) ? value : [value];

export const pairList = <T>(...pairs: Array<Pair<T>>) => pairs;

export function repeat<T>(count: number, make: (index: number) => T): T[];
export function repeat<T>(count: number, value: T): T[];
export function repeat<T>(
    count: number,
    valueOrMake: T | ((index: number) => T),
): T[] {
    return Array.from({ length: count }, (_, index) =>
        typeof valueOrMake === "function"
            ? (valueOrMake as (index: number) => T)(index)
            : valueOrMake,
    );
}

export const isPlainObject = (
    value: unknown,
): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

export type NestedRecord<TLeaf> =
    | TLeaf
    | { [key: string]: NestedRecord<TLeaf> };

type MapNestedRecord<TNode, TLeaf, TOut> = TNode extends TLeaf
    ? TOut
    : TNode extends Record<string, unknown>
      ? { [K in keyof TNode]: MapNestedRecord<TNode[K], TLeaf, TOut> }
      : never;

export function mapNestedRecordValues<
    TLeaf,
    TNode extends NestedRecord<TLeaf>,
    TOut,
>(
    node: TNode,
    mapLeaf: (value: TLeaf) => TOut,
): MapNestedRecord<TNode, TLeaf, TOut> {
    if (isPlainObject(node)) {
        return Object.fromEntries(
            Object.entries(node).map(([key, value]) => [
                key,
                mapNestedRecordValues(value as NestedRecord<TLeaf>, mapLeaf),
            ]),
        ) as MapNestedRecord<TNode, TLeaf, TOut>;
    }

    return mapLeaf(node as TLeaf) as MapNestedRecord<TNode, TLeaf, TOut>;
}

export const mergeDeep = <T extends Record<string, unknown>>(
    base: T,
    next: Partial<T>,
): T => {
    const out: Record<string, unknown> = { ...base };

    Object.entries(next).forEach(([key, value]) => {
        if (value === undefined) return;

        const prev = out[key];

        if (isPlainObject(prev) && isPlainObject(value)) {
            out[key] = mergeDeep(prev, value);
            return;
        }

        out[key] = value;
    });

    return out as T;
};

export type Selector<T, R> = (item: T) => R;

export function sortBy<T>(items: T[], selector: Selector<T, number>): T[] {
    return [...items].sort((a, b) => selector(a) - selector(b));
}

export function unique<T>(items: T[]): T[] {
    return items.filter((item, index, list) => list.indexOf(item) === index);
}

export function clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;

    return value;
}
