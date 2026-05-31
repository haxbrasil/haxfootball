import { ticks } from "@common/general/time";

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
