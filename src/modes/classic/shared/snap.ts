import { ticks } from "@common/general/time";
import { getDistance } from "@common/math/geometry";
import { ballWithRadius } from "./stadium";

export const HIKING_DISTANCE_LIMIT = 40;
export const MIN_SNAP_DELAY_TICKS = ticks({ seconds: 2 });

export function isTooFarFromBall(
    position: Position | undefined,
    ballPos: Position,
) {
    return (
        !position ||
        getDistance(position, ballWithRadius(ballPos)) > HIKING_DISTANCE_LIMIT
    );
}
