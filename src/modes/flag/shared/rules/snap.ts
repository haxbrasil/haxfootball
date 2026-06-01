import { ticks } from "@common/general/time";
import { getDistance } from "@common/math/geometry";
import { ballWithRadius } from "@modes/flag/shared/field";

export const HIKING_DISTANCE_LIMIT = 40;
export const MIN_SNAP_DELAY_TICKS = ticks({ seconds: 2 });
export const HIKE_TIMEOUT_SECONDS = 8;
export const HIKE_TIMEOUT_TICKS = ticks({ seconds: HIKE_TIMEOUT_SECONDS });
export const HIKE_WARNING_SECONDS_REMAINING = 3;
export const HIKE_WARNING_TICKS =
    HIKE_TIMEOUT_TICKS - ticks({ seconds: HIKE_WARNING_SECONDS_REMAINING });

export function isTooFarFromBall(
    position: Position | undefined,
    ballPos: Position,
) {
    return (
        !position ||
        getDistance(position, ballWithRadius(ballPos)) > HIKING_DISTANCE_LIMIT
    );
}
