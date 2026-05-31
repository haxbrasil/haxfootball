import { ticks } from "@common/general/time";

export const BLITZ_BASE_DELAY_TICKS = ticks({ seconds: 12 });
export const BLITZ_EARLY_DELAY_TICKS = ticks({ seconds: 3 });
export const BLITZ_EARLY_MOVE_THRESHOLD_PX = 5;
export const BLITZ_EARLY_NOTICE_DELAY_TICKS = ticks({ seconds: 1 });

export const BLITZ_EARLY_NOTICE_REMAINING_SECONDS =
    (BLITZ_EARLY_DELAY_TICKS - BLITZ_EARLY_NOTICE_DELAY_TICKS) /
    ticks({ seconds: 1 });

export const BLITZ_BASE_DELAY_IN_SECONDS =
    BLITZ_BASE_DELAY_TICKS / ticks({ seconds: 1 });
