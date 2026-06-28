import { type FieldPosition } from "@common/game/game";
import { hexColorToNumber } from "@common/general/color";
import type { Pair } from "@common/general/types";
import type { Line } from "@common/math/geometry";
import {
    BALL_COLOR,
    flagMapMeasures as MapMeasures,
} from "@modes/flag/stadium";
import { getPositionFromFieldPosition } from "./position";

const dynamicLineRefs = (ref: string): Pair<string> => [`${ref}.a`, `${ref}.b`];

const SPECIAL_DISC_IDS = {
    LOS: dynamicLineRefs("blue0"),
    INTERCEPTION_PATH: dynamicLineRefs("ball0"),
};

export const BALL_DISC_ID = 0;
export const BALL_ACTIVE_COLOR = hexColorToNumber(BALL_COLOR);
export const BALL_INACTIVE_COLOR = 0x808080;
export const LOS_BLOCKER_REFS = {
    A: "losBlocker.a",
    B: "losBlocker.b",
};

export function getLineOfScrimmage(): { id: string }[];
export function getLineOfScrimmage(
    fieldPos: FieldPosition,
): { id: string; position: Position }[];
export function getLineOfScrimmage(
    fieldPos?: FieldPosition,
): { id: string; position?: Position }[] {
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

export function getInterceptionPath(): { id: string }[];
export function getInterceptionPath(
    line: Line,
): { id: string; position: Position }[];
export function getInterceptionPath(
    line?: Line,
): { id: string; position?: Position }[] {
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
