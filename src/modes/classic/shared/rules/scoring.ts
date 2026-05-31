import { PointLike } from "@common/math/geometry";
import { opposite } from "@common/game/game";
import type { ScoreState } from "@common/game/game";
import {
    calculateDirectionalGain,
    getPositionFromFieldPosition,
    intersectsEndZone,
} from "@modes/classic/shared/field";
import { FieldTeam, Team } from "@runtime/models";
import { $scores } from "@runtime/runtime";

export const SCORES = {
    SAFETY: 2,
    TOUCHDOWN: 6,
    FIELD_GOAL: 3,
    EXTRA_POINT: 1,
    TWO_POINT: 2,
};

export function getTouchdownScore(scoreBeforeTouchdown: ScoreState): number {
    const nativeScores = $scores();

    const isExpectedTimeReached =
        !!nativeScores &&
        nativeScores.timeLimit > 0 &&
        nativeScores.time >= nativeScores.timeLimit;

    const isTiedBeforeTouchdown =
        scoreBeforeTouchdown[Team.RED] === scoreBeforeTouchdown[Team.BLUE];

    if (isExpectedTimeReached && isTiedBeforeTouchdown) {
        return SCORES.TOUCHDOWN + SCORES.EXTRA_POINT;
    }

    return SCORES.TOUCHDOWN;
}

export function isTouchdown({
    player,
    offensiveTeam,
}: {
    player: PointLike;
    offensiveTeam: FieldTeam;
}) {
    const scoringSide = opposite(offensiveTeam);
    const goalLineX = getPositionFromFieldPosition({
        side: scoringSide,
        yards: 0,
    });

    const radius = Math.max(0, player.radius ?? 0);
    const brokePlane =
        calculateDirectionalGain(offensiveTeam, player.x - goalLineX) +
            radius >=
        0;

    const isTouchdown = brokePlane && intersectsEndZone(player, scoringSide);

    return isTouchdown;
}
