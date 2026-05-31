import { t } from "@lingui/core/macro";
import { ticks } from "@common/general/time";

export const SAFETY_KICK_TIMEOUT_SECONDS = 8;
export const SAFETY_KICK_TIMEOUT_TICKS = ticks({
    seconds: SAFETY_KICK_TIMEOUT_SECONDS,
});

export function formatSafetyScoreMessage(timeoutsEnabled: boolean): string {
    return timeoutsEnabled
        ? t`SAFETY! Kick within ${SAFETY_KICK_TIMEOUT_SECONDS}s.`
        : t`SAFETY!`;
}
