import { FieldTeam } from "@runtime/models";
import { FieldPosition, opposite } from "@common/game/game";
import { calculateYardsGained, isInRedZone } from "@modes/flag/shared/field";

export type DownAndDistance = {
    down: number;
    distance: number;
};

export type DownState = {
    downAndDistance: DownAndDistance;
    offensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
    redZoneFouls: number;
    lastBallY: number;
};

export type DownEvent =
    | { type: "NEXT_DOWN"; yardsGained: number }
    | { type: "TURNOVER_ON_DOWNS" };

export type NextDownState = {
    downState: DownState;
    event: DownEvent;
};

export type DownEventIncrement =
    | { type: "NEXT_DOWN" }
    | { type: "TURNOVER_ON_DOWNS" };

export type NextDownStateIncrement = {
    downState: DownState;
    event: DownEventIncrement;
};

export const FLAG_START_YARD_LINE = 25;
export const MAX_DOWNS = 4;
export const FIRST_DOWN = 1;

export const INITIAL_DOWN_AND_DISTANCE: DownAndDistance = {
    down: FIRST_DOWN,
    distance: 0,
};

export function getInitialDownState(
    offensiveTeam: FieldTeam,
    fieldPos: FieldPosition,
    lastBallY: number = 0,
): DownState {
    return {
        offensiveTeam,
        downAndDistance: INITIAL_DOWN_AND_DISTANCE,
        fieldPos,
        redZoneFouls: 0,
        lastBallY,
    };
}

export function getRestartDownState(
    offensiveTeam: FieldTeam,
    lastBallY: number = 0,
): DownState {
    return getInitialDownState(
        offensiveTeam,
        {
            side: offensiveTeam,
            yards: FLAG_START_YARD_LINE,
        },
        lastBallY,
    );
}

export function getRedZoneFoulCount(
    downState: DownState,
    fieldPos: FieldPosition,
): number {
    return isInRedZone(downState.offensiveTeam, fieldPos)
        ? downState.redZoneFouls
        : 0;
}

export function incrementDownState(current: DownState): NextDownStateIncrement {
    const newDown = current.downAndDistance.down + 1;
    const redZoneFouls = getRedZoneFoulCount(current, current.fieldPos);

    if (newDown > MAX_DOWNS) {
        return {
            downState: getRestartDownState(opposite(current.offensiveTeam)),
            event: { type: "TURNOVER_ON_DOWNS" },
        };
    }

    return {
        downState: {
            offensiveTeam: current.offensiveTeam,
            fieldPos: current.fieldPos,
            downAndDistance: { ...current.downAndDistance, down: newDown },
            redZoneFouls,
            lastBallY: current.lastBallY,
        },
        event: { type: "NEXT_DOWN" },
    };
}

export function advanceDownState(
    current: DownState,
    newFieldPos?: FieldPosition,
): NextDownState {
    const actualFieldPos = newFieldPos ?? current.fieldPos;
    const redZoneFouls = getRedZoneFoulCount(current, actualFieldPos);
    const yardsGained = calculateYardsGained(
        current.offensiveTeam,
        current.fieldPos,
        actualFieldPos,
    );

    const newDown = current.downAndDistance.down + 1;

    if (newDown > MAX_DOWNS) {
        return {
            downState: getRestartDownState(opposite(current.offensiveTeam)),
            event: { type: "TURNOVER_ON_DOWNS" },
        };
    }

    return {
        downState: {
            offensiveTeam: current.offensiveTeam,
            fieldPos: actualFieldPos,
            downAndDistance: { ...current.downAndDistance, down: newDown },
            redZoneFouls,
            lastBallY: current.lastBallY,
        },
        event: { type: "NEXT_DOWN", yardsGained },
    };
}

export function withLastBallY(
    downState: DownState,
    lastBallY: number,
): DownState {
    return {
        ...downState,
        lastBallY,
    };
}

export function withLastBallYAtCenter(downState: DownState): DownState {
    return withLastBallY(downState, 0);
}

export function processDownEvent({
    event,
    onNextDown,
    onTurnoverOnDowns,
}: {
    event: DownEvent;
    onNextDown: {
        onYardsGained: (yardsGained: number) => void;
        onNoGain: () => void;
        onLoss: (yardsLost: number) => void;
    };
    onTurnoverOnDowns: () => void;
}) {
    switch (event.type) {
        case "NEXT_DOWN":
            if (event.yardsGained === 0) {
                onNextDown.onNoGain();
            } else if (event.yardsGained > 0) {
                onNextDown.onYardsGained(event.yardsGained);
            } else {
                onNextDown.onLoss(-event.yardsGained);
            }
            break;
        case "TURNOVER_ON_DOWNS":
            onTurnoverOnDowns();
            break;
        default:
            break;
    }
}

export function processDownEventIncrement({
    event,
    onNextDown,
    onTurnoverOnDowns,
}: {
    event: DownEventIncrement;
    onNextDown: () => void;
    onTurnoverOnDowns: () => void;
}) {
    switch (event.type) {
        case "NEXT_DOWN":
            onNextDown();
            break;
        case "TURNOVER_ON_DOWNS":
            onTurnoverOnDowns();
            break;
        default:
            break;
    }
}
