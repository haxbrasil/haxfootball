import { ticks } from "@common/general/time";

export const HIKE_TIMEOUT_SECONDS = 12;
export const HIKE_TIMEOUT_TICKS = ticks({ seconds: HIKE_TIMEOUT_SECONDS });
export const HIKE_WARNING_SECONDS_REMAINING = 3;
export const HIKE_WARNING_TICKS =
    HIKE_TIMEOUT_TICKS - ticks({ seconds: HIKE_WARNING_SECONDS_REMAINING });

export const PUNT_KICK_TIMEOUT_SECONDS = 8;
export const PUNT_KICK_TIMEOUT_TICKS = ticks({
    seconds: PUNT_KICK_TIMEOUT_SECONDS,
});

export const SAFETY_KICK_TIMEOUT_SECONDS = 8;
export const SAFETY_KICK_TIMEOUT_TICKS = ticks({
    seconds: SAFETY_KICK_TIMEOUT_SECONDS,
});

export const KICKOFF_WARNING_SECONDS = 8;
export const KICKOFF_WARNING_TICKS = ticks({
    seconds: KICKOFF_WARNING_SECONDS,
});
export const KICKOFF_KICK_TIMEOUT_SECONDS = 12;
export const KICKOFF_KICK_TIMEOUT_TICKS = ticks({
    seconds: KICKOFF_KICK_TIMEOUT_SECONDS,
});
export const KICKOFF_WARNING_SECONDS_REMAINING =
    KICKOFF_KICK_TIMEOUT_SECONDS - KICKOFF_WARNING_SECONDS;
