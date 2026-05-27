import { opposite } from "@common/game/game";
import {
    calculateYardsGained,
    getFieldPosition,
    calculateSnapBallPosition,
    getDistanceToGoalLine,
    isInRedZone,
} from "./stadium";
import {
    DISTANCE_TO_FIRST_DOWN,
    DownState,
    FIRST_DOWN,
    getRedZoneFoulCount,
    INITIAL_DOWN_AND_DISTANCE,
    MAX_DOWNS,
} from "./down";

export type DefensivePenaltyEvent =
    | { type: "SAME_DOWN"; yardsGained: number }
    | { type: "FIRST_DOWN"; yardsGained: number }
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
    onFirstDown,
    onTouchdown,
}: {
    event: DefensivePenaltyEvent;
    onSameDown: (yardsGained: number) => void;
    onFirstDown: (yardsGained: number) => void;
    onTouchdown: () => void;
}) {
    switch (event.type) {
        case "SAME_DOWN":
            onSameDown(event.yardsGained);
            break;
        case "FIRST_DOWN":
            onFirstDown(event.yardsGained);
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

function getPenaltyOutcome(
    downState: DownState,
    yards: number,
    options?: { allowFirstDown?: boolean },
) {
    const { offensiveTeam, fieldPos, downAndDistance } = downState;
    const penaltyFieldPos = getFieldPosition(
        calculateSnapBallPosition(offensiveTeam, fieldPos, -yards).x,
    );
    const yardsGained = calculateYardsGained(
        offensiveTeam,
        fieldPos,
        penaltyFieldPos,
    );
    const newDistance = downAndDistance.distance - yardsGained;
    const allowFirstDown = options?.allowFirstDown !== false;
    const adjustedDistance = allowFirstDown
        ? newDistance
        : Math.max(0, newDistance);

    const updatedDownState: DownState =
        allowFirstDown && newDistance <= 0
            ? {
                  offensiveTeam,
                  fieldPos: penaltyFieldPos,
                  downAndDistance: {
                      down: FIRST_DOWN,
                      distance: DISTANCE_TO_FIRST_DOWN,
                  },
                  redZoneFouls: downState.redZoneFouls,
                  lastBallY: downState.lastBallY,
              }
            : {
                  offensiveTeam,
                  fieldPos: penaltyFieldPos,
                  downAndDistance: {
                      down: downAndDistance.down,
                      distance: adjustedDistance,
                  },
                  redZoneFouls: downState.redZoneFouls,
                  lastBallY: downState.lastBallY,
              };

    return { updatedDownState, yardsGained, newDistance };
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
    const { updatedDownState, yardsGained, newDistance } = getPenaltyOutcome(
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

    return newDistance <= 0
        ? {
              downState: nextDownState,
              event: { type: "FIRST_DOWN", yardsGained },
          }
        : {
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
        { allowFirstDown: false },
    );
    const yardsLost = Math.max(0, -yardsGained);
    const nextDown = updatedDownState.downAndDistance.down + 1;
    const redZoneFouls = getRedZoneFoulCount(
        downState,
        updatedDownState.fieldPos,
    );

    if (nextDown > MAX_DOWNS) {
        return {
            downState: {
                offensiveTeam: opposite(updatedDownState.offensiveTeam),
                fieldPos: updatedDownState.fieldPos,
                downAndDistance: INITIAL_DOWN_AND_DISTANCE,
                redZoneFouls: 0,
                lastBallY: updatedDownState.lastBallY,
            },
            event: { type: "TURNOVER_ON_DOWNS", yardsLost },
        };
    }

    return {
        downState: {
            ...updatedDownState,
            downAndDistance: {
                down: nextDown,
                distance: updatedDownState.downAndDistance.distance,
            },
            redZoneFouls,
        },
        event: { type: "NEXT_DOWN", yardsLost },
    };
}
