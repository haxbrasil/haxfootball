import { type FieldPosition } from "@common/game/game";
import { hexColorToNumber } from "@common/general/color";
import type { Line } from "@common/math/geometry";
import {
    BALL_COLOR,
    index,
    flagMapMeasures as MapMeasures,
    lineIndex,
    LOS_BLOCKER_DISC_COUNT,
} from "@modes/flag/stadium";
import { getPositionFromFieldPosition } from "./position";

const SPECIAL_DISC_IDS = {
    LOS: lineIndex("blue0"),
    INTERCEPTION_PATH: lineIndex("ball0"),
    LOS_BLOCKERS: Array.from(
        { length: LOS_BLOCKER_DISC_COUNT },
        (_, blockerIndex) => index(`losBlocker${blockerIndex}`),
    ),
};

export const BALL_DISC_ID = 0;
export const BALL_ACTIVE_COLOR = hexColorToNumber(BALL_COLOR);
export const BALL_INACTIVE_COLOR = 0x808080;

export function getLineOfScrimmage(): { id: number }[];
export function getLineOfScrimmage(
    fieldPos: FieldPosition,
): { id: number; position: Position }[];
export function getLineOfScrimmage(
    fieldPos?: FieldPosition,
): { id: number; position?: Position }[] {
    if (fieldPos === undefined) {
        return [
            { id: SPECIAL_DISC_IDS.LOS[0] },
            { id: SPECIAL_DISC_IDS.LOS[1] },
        ];
    }

    const x = getPositionFromFieldPosition(fieldPos);
    const offset = 2;
    const upperHashY = MapMeasures.INNER_FIELD.topLeft.y + offset;
    const lowerHashY = MapMeasures.INNER_FIELD.bottomRight.y - offset;

    return [
        { id: SPECIAL_DISC_IDS.LOS[0], position: { x, y: upperHashY } },
        { id: SPECIAL_DISC_IDS.LOS[1], position: { x, y: lowerHashY } },
    ];
}

export function getInterceptionPath(): { id: number }[];
export function getInterceptionPath(
    line: Line,
): { id: number; position: Position }[];
export function getInterceptionPath(
    line?: Line,
): { id: number; position?: Position }[] {
    if (!line) {
        return [
            { id: SPECIAL_DISC_IDS.INTERCEPTION_PATH[0] },
            { id: SPECIAL_DISC_IDS.INTERCEPTION_PATH[1] },
        ];
    }

    return [
        {
            id: SPECIAL_DISC_IDS.INTERCEPTION_PATH[0],
            position: { x: line.start.x, y: line.start.y },
        },
        {
            id: SPECIAL_DISC_IDS.INTERCEPTION_PATH[1],
            position: { x: line.end.x, y: line.end.y },
        },
    ];
}

export function getLineOfScrimmageBlockers(): { id: number }[] {
    return SPECIAL_DISC_IDS.LOS_BLOCKERS.map((id) => ({ id }));
}
