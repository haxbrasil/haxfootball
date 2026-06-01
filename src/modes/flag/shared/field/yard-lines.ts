import type { FieldPosition } from "@common/game/game";
import { Team, type FieldTeam } from "@runtime/models";
import { flagMapMeasures as MapMeasures } from "@modes/flag/stadium";
import { getPositionFromFieldPosition } from "./position";

export const BALL_OFFSET_YARDS = 3.5;
export const YARD_LENGTH = MapMeasures.YARD;

export function offsetXByYards(
    baseX: number,
    direction: 1 | -1,
    yards: number,
): number {
    return baseX + direction * yards * YARD_LENGTH;
}

export function xDistanceToYards(xDistance: number): number {
    return Math.round(xDistance / MapMeasures.YARD);
}

export function calculateDirectionalGain(
    offensiveTeam: Team,
    xGained: number,
): number {
    return offensiveTeam === Team.RED ? xGained : -xGained;
}

export function calculateYardsGained(
    offensiveTeam: Team,
    fromFieldPos: FieldPosition,
    toFieldPos: FieldPosition,
): number {
    const fromX = getPositionFromFieldPosition(fromFieldPos);
    const toX = getPositionFromFieldPosition(toFieldPos);
    const xGained = toX - fromX;

    return xDistanceToYards(calculateDirectionalGain(offensiveTeam, xGained));
}

export function getDistanceToGoalLine(
    offensiveTeam: FieldTeam,
    fieldPos: FieldPosition,
): number {
    const goalLineX =
        offensiveTeam === Team.RED
            ? MapMeasures.BLUE_END_ZONE_LINE_CENTER.x
            : MapMeasures.RED_END_ZONE_LINE_CENTER.x;
    const currentX = getPositionFromFieldPosition(fieldPos);
    const directionalX =
        offensiveTeam === Team.RED
            ? goalLineX - currentX
            : currentX - goalLineX;

    return Math.max(0, xDistanceToYards(directionalX));
}
