import { ticks } from "@common/general/time";

export const PUNT_KICK_TIMEOUT_SECONDS = 8;
export const PUNT_KICK_TIMEOUT_TICKS = ticks({
    seconds: PUNT_KICK_TIMEOUT_SECONDS,
});
