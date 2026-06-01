import { opposite } from "@common/game/game";
import type { ScoreState } from "@common/game/game";
import { PointLike } from "@common/math/geometry";
import {
    calculateDirectionalGain,
    getPositionFromFieldPosition,
    intersectsEndZone,
} from "@modes/flag/shared/field";
import { FieldTeam } from "@runtime/models";

export const SCORES = {
    SAFETY: 2,
    TOUCHDOWN: 6,
    EXTRA_POINT: 1,
};

export function getTouchdownScore(_scoreBeforeTouchdown: ScoreState): number {
    return SCORES.TOUCHDOWN + SCORES.EXTRA_POINT;
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
