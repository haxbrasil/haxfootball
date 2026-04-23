import { clamp } from "@common/general/helpers";

export type BlockingVec2 = {
    x: number;
    y: number;
};

export type BlockingPlayerState = {
    id: number;
    position: BlockingVec2;
};

export type BlockingPointState = {
    id: number;
    position: BlockingVec2;
};

export type BlockingLineSegment = {
    a: BlockingVec2;
    b: BlockingVec2;
};

export type MoveBlockingPointAction = {
    blockerId: number;
    target: BlockingVec2;
};

export type BlockingPlan = {
    moves: MoveBlockingPointAction[];
};

export type BlockingPlanParams = {
    line: BlockingLineSegment;
    players: ReadonlyArray<BlockingPlayerState>;
    blockers: ReadonlyArray<BlockingPointState>;
    playerRadius?: number;
    blockerRadius?: number;
    activationDistanceX?: number;
    verticalMargin?: number;
    restOffset?: number;
};

const EPSILON = 1e-6;
const POSITION_EPSILON_SQ = 1;

type Interval = { start: number; end: number };
type SlotImportance = { index: number; importance: number };

function distanceSq(a: BlockingVec2, b: BlockingVec2): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;

    return dx * dx + dy * dy;
}

function computeRestPosition(
    blockerIndex: number,
    lineX: number,
    yMin: number,
    yMax: number,
    restOffset: number,
): BlockingVec2 {
    if (blockerIndex % 2 === 0) {
        return {
            x: lineX,
            y: yMin - restOffset,
        };
    }

    return {
        x: lineX,
        y: yMax + restOffset,
    };
}

function enqueueMoveIfNeeded(
    moves: MoveBlockingPointAction[],
    blocker: BlockingPointState,
    target: BlockingVec2,
) {
    if (distanceSq(blocker.position, target) <= POSITION_EPSILON_SQ) {
        return;
    }

    moves.push({ blockerId: blocker.id, target });
}

function sendAllBlockersToRest(
    blockers: ReadonlyArray<BlockingPointState>,
    lineX: number,
    yMin: number,
    yMax: number,
    restOffset: number,
): MoveBlockingPointAction[] {
    const moves: MoveBlockingPointAction[] = [];

    blockers.forEach((blocker, blockerIndex) => {
        enqueueMoveIfNeeded(
            moves,
            blocker,
            computeRestPosition(blockerIndex, lineX, yMin, yMax, restOffset),
        );
    });

    return moves;
}

export function computeBlockingPlan(params: BlockingPlanParams): BlockingPlan {
    const {
        line,
        players,
        blockers,
        playerRadius = 15,
        blockerRadius = 15,
        activationDistanceX = 45,
        verticalMargin = 3 * playerRadius,
        restOffset = 200,
    } = params;

    if (blockers.length === 0) {
        return { moves: [] };
    }

    const lineX = line.a.x;
    if (Math.abs(lineX - line.b.x) > EPSILON) {
        throw new Error("computeBlockingPlan: line must be vertical.");
    }

    const yMin = Math.min(line.a.y, line.b.y);
    const yMax = Math.max(line.a.y, line.b.y);
    const activePlayers = players.filter(
        (player) => Math.abs(player.position.x - lineX) <= activationDistanceX,
    );

    if (activePlayers.length === 0) {
        return {
            moves: sendAllBlockersToRest(
                blockers,
                lineX,
                yMin,
                yMax,
                restOffset,
            ),
        };
    }

    const intervals = activePlayers.reduce<Interval[]>((acc, player) => {
        const start = clamp(player.position.y - verticalMargin, yMin, yMax);
        const end = clamp(player.position.y + verticalMargin, yMin, yMax);

        if (end >= start) {
            return [...acc, { start, end }];
        }

        return acc;
    }, []);

    if (intervals.length === 0) {
        return {
            moves: sendAllBlockersToRest(
                blockers,
                lineX,
                yMin,
                yMax,
                restOffset,
            ),
        };
    }

    const sortedIntervals = [...intervals].sort((a, b) => a.start - b.start);
    const firstInterval = sortedIntervals[0];

    if (!firstInterval) {
        return {
            moves: sendAllBlockersToRest(
                blockers,
                lineX,
                yMin,
                yMax,
                restOffset,
            ),
        };
    }

    const mergedIntervals: Interval[] = [{ ...firstInterval }];

    sortedIntervals.slice(1).forEach((interval) => {
        const current = mergedIntervals[mergedIntervals.length - 1];
        if (!current) {
            mergedIntervals.push({ ...interval });
            return;
        }

        if (interval.start <= current.end) {
            current.end = Math.max(current.end, interval.end);
            return;
        }

        mergedIntervals.push({ ...interval });
    });

    const slotHeight = 2 * blockerRadius;
    const rawSlotCount = (yMax - yMin) / slotHeight;
    const slotCount = Math.max(1, Math.ceil(rawSlotCount));
    const slotCenters = Array.from(
        { length: slotCount },
        (_, slotIndex) => yMin + (slotIndex + 0.5) * slotHeight,
    );

    const slotsToConsider = slotCenters.reduce<SlotImportance[]>(
        (acc, centerY, slotIndex) => {
            const isInsideMergedIntervals = mergedIntervals.some(
                (interval) =>
                    centerY >= interval.start && centerY <= interval.end,
            );

            if (!isInsideMergedIntervals) {
                return acc;
            }

            const importance = activePlayers.reduce(
                (bestDistance, player) =>
                    Math.min(
                        bestDistance,
                        Math.abs(centerY - player.position.y),
                    ),
                Number.POSITIVE_INFINITY,
            );

            return [...acc, { index: slotIndex, importance }];
        },
        [],
    );

    if (slotsToConsider.length === 0) {
        return {
            moves: sendAllBlockersToRest(
                blockers,
                lineX,
                yMin,
                yMax,
                restOffset,
            ),
        };
    }

    const chosenSlots = [...slotsToConsider]
        .sort((a, b) => a.importance - b.importance)
        .slice(0, Math.min(slotsToConsider.length, blockers.length));

    const availableBlockerIndices = Array.from(
        { length: blockers.length },
        (_, blockerIndex) => blockerIndex,
    );
    const moves: MoveBlockingPointAction[] = [];

    const popNearestBlockerIndex = (targetY: number): number => {
        const target = { x: lineX, y: targetY };
        const nearest = availableBlockerIndices.reduce<{
            blockerIndex: number;
            distance: number;
        } | null>((best, blockerIndex) => {
            const blocker = blockers[blockerIndex];
            if (!blocker) return best;

            const distance = distanceSq(blocker.position, target);
            if (!best || distance < best.distance) {
                return { blockerIndex, distance };
            }

            return best;
        }, null);

        if (!nearest) return -1;

        const nextAvailable = availableBlockerIndices.filter(
            (index) => index !== nearest.blockerIndex,
        );

        availableBlockerIndices.length = 0;
        availableBlockerIndices.push(...nextAvailable);

        return nearest.blockerIndex;
    };

    chosenSlots.forEach((slot) => {
        const centerY = slotCenters[slot.index];
        if (centerY === undefined) return;

        const blockerIndex = popNearestBlockerIndex(centerY);
        const blocker = blockers[blockerIndex];

        if (!blocker) {
            return;
        }

        enqueueMoveIfNeeded(moves, blocker, { x: lineX, y: centerY });
    });

    availableBlockerIndices.forEach((blockerIndex) => {
        const blocker = blockers[blockerIndex];
        if (!blocker) return;

        enqueueMoveIfNeeded(
            moves,
            blocker,
            computeRestPosition(blockerIndex, lineX, yMin, yMax, restOffset),
        );
    });

    return { moves };
}
