import { opposite } from "@common/game/game";
import {
    calculateYardsGained,
    getFieldPosition,
    calculateSnapBallPosition,
    getDistanceToGoalLine,
    isInRedZone,
} from "@modes/flag/shared/field";
import {
    DownState,
    getRedZoneFoulCount,
    getRestartDownState,
    MAX_DOWNS,
} from "./down";

export type DefensivePenaltyEvent =
    | { type: "SAME_DOWN"; yardsGained: number }
    | { type: "TOUCHDOWN" };

export type DefensivePenaltyState = {
    downState: DownState;
    event: DefensivePenaltyEvent;
};

export type OffensivePenaltyEvent =
    | { type: "NEXT_DOWN"; yardsLost: number }
    | { type: "TURNOVER_ON_DOWNS"; yardsLost: number };

export type OffensivePenalty = {
    downState: DownState;
    event: OffensivePenaltyEvent;
};

export const RED_ZONE_FOUL_LIMIT = 3;

export function processDefensivePenaltyEvent({
    event,
    onSameDown,
    onTouchdown,
}: {
    event: DefensivePenaltyEvent;
    onSameDown: (yardsGained: number) => void;
    onTouchdown: () => void;
}) {
    switch (event.type) {
        case "SAME_DOWN":
            onSameDown(event.yardsGained);
            break;
        case "TOUCHDOWN":
            onTouchdown();
            break;
        default:
            break;
    }
}

export function processOffensivePenalty({
    event,
    onNextDown,
    onTurnoverOnDowns,
}: {
    event: OffensivePenaltyEvent;
    onNextDown: (yardsLost: number) => void;
    onTurnoverOnDowns: (yardsLost: number) => void;
}) {
    switch (event.type) {
        case "NEXT_DOWN":
            onNextDown(event.yardsLost);
            break;
        case "TURNOVER_ON_DOWNS":
            onTurnoverOnDowns(event.yardsLost);
            break;
        default:
            break;
    }
}

function getPenaltyOutcome(downState: DownState, yards: number) {
    const { offensiveTeam, fieldPos, downAndDistance } = downState;
    const penaltyFieldPos = getFieldPosition(
        calculateSnapBallPosition(offensiveTeam, fieldPos, -yards).x,
    );
    const yardsGained = calculateYardsGained(
        offensiveTeam,
        fieldPos,
        penaltyFieldPos,
    );
    const updatedDownState: DownState = {
        offensiveTeam,
        fieldPos: penaltyFieldPos,
        downAndDistance,
        redZoneFouls: downState.redZoneFouls,
        lastBallY: downState.lastBallY,
    };

    return { updatedDownState, yardsGained };
}

export function applyDefensivePenalty(
    downState: DownState,
    yards: number,
): DefensivePenaltyState {
    const distanceToGoalLine = getDistanceToGoalLine(
        downState.offensiveTeam,
        downState.fieldPos,
    );
    const halfDistance = Math.max(1, Math.floor(distanceToGoalLine / 2));
    const adjustedYards =
        distanceToGoalLine > 0 && yards >= distanceToGoalLine
            ? halfDistance
            : yards;
    const { updatedDownState, yardsGained } = getPenaltyOutcome(
        downState,
        adjustedYards,
    );
    const wasInRedZone = isInRedZone(
        downState.offensiveTeam,
        downState.fieldPos,
    );
    const foulCount = wasInRedZone ? downState.redZoneFouls + 1 : 0;
    const shouldAwardTouchdown =
        wasInRedZone && foulCount >= RED_ZONE_FOUL_LIMIT;
    const staysInRedZone = isInRedZone(
        downState.offensiveTeam,
        updatedDownState.fieldPos,
    );
    const redZoneFouls =
        shouldAwardTouchdown || !staysInRedZone ? 0 : foulCount;
    const nextDownState = {
        ...updatedDownState,
        redZoneFouls,
    };

    if (shouldAwardTouchdown) {
        return {
            downState: nextDownState,
            event: { type: "TOUCHDOWN" },
        };
    }

    return {
        downState: nextDownState,
        event: { type: "SAME_DOWN", yardsGained },
    };
}

export function applyOffensivePenalty(
    downState: DownState,
    yards: number,
): OffensivePenalty {
    const { updatedDownState, yardsGained } = getPenaltyOutcome(
        downState,
        yards,
    );
    const yardsLost = Math.max(0, -yardsGained);
    const nextDown = updatedDownState.downAndDistance.down + 1;
    const redZoneFouls = getRedZoneFoulCount(
        downState,
        updatedDownState.fieldPos,
    );

    if (nextDown > MAX_DOWNS) {
        return {
            downState: getRestartDownState(
                opposite(updatedDownState.offensiveTeam),
            ),
            event: { type: "TURNOVER_ON_DOWNS", yardsLost },
        };
    }

    return {
        downState: {
            ...updatedDownState,
            downAndDistance: {
                down: nextDown,
                distance: downState.downAndDistance.distance,
            },
            redZoneFouls,
        },
        event: { type: "NEXT_DOWN", yardsLost },
    };
}
