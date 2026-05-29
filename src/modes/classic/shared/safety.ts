import { t } from "@lingui/core/macro";
import { SAFETY_KICK_TIMEOUT_SECONDS } from "./timeouts";

export function formatSafetyScoreMessage(timeoutsEnabled: boolean): string {
    return timeoutsEnabled
        ? t`SAFETY! Kick within ${SAFETY_KICK_TIMEOUT_SECONDS}s.`
        : t`SAFETY!`;
}
