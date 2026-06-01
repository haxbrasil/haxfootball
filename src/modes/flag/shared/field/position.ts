import {
    calculateFieldPosition,
    calculatePositionFromFieldPosition,
    type FieldPosition,
} from "@common/game/game";
import type { PointLike } from "@common/math/geometry";
import { Team } from "@runtime/models";
import {
    BALL_RADIUS,
    flagMapMeasures as MapMeasures,
} from "@modes/flag/stadium";

const HASH_UPPER_CENTER_Y =
    MapMeasures.HASHES_HEIGHT.upperY + MapMeasures.SINGLE_HASH_HEIGHT / 2;
const HASH_LOWER_CENTER_Y =
    MapMeasures.HASHES_HEIGHT.lowerY - MapMeasures.SINGLE_HASH_HEIGHT / 2;

export function clampToHashCenterY(y: number): number {
    if (y < HASH_UPPER_CENTER_Y) {
        return HASH_UPPER_CENTER_Y;
    }

    if (y > HASH_LOWER_CENTER_Y) {
        return HASH_LOWER_CENTER_Y;
    }

    return y;
}

export function getFieldPosition(
    x: number,
    startX = MapMeasures.RED_END_ZONE_START_POSITION_X,
    endX = MapMeasures.BLUE_END_ZONE_START_POSITION_X,
    yardLength = MapMeasures.YARD,
): FieldPosition {
    return calculateFieldPosition(x, startX, endX, yardLength);
}

export function getPositionFromFieldPosition(
    fieldPos: FieldPosition,
    startX = MapMeasures.RED_END_ZONE_LINE_CENTER.x,
    endX = MapMeasures.BLUE_END_ZONE_LINE_CENTER.x,
    yardLength = MapMeasures.YARD,
): number {
    return calculatePositionFromFieldPosition(
        fieldPos,
        startX,
        endX,
        yardLength,
    );
}

export function calculateSnapBallPosition(
    forTeam: Team,
    fieldPos: FieldPosition,
    offsetYards = 0,
    yardLength = MapMeasures.YARD,
): Position {
    return {
        x:
            getPositionFromFieldPosition(fieldPos) +
            yardLength * offsetYards * (forTeam === Team.RED ? -1 : 1),
        y: 0,
    };
}

export function ballWithRadius(
    position: Position,
    radius = BALL_RADIUS,
): PointLike {
    return {
        x: position.x,
        y: position.y,
        radius,
    };
}
