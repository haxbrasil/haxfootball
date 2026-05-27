import {
    DEFAULT_TOUCHING_DISTANCE,
    findBallCatcher,
    findBallCatchers,
    findCatchers,
} from "@common/game/game";
import { getDistance, type PointLike } from "@common/math/geometry";
import { type FieldTeam } from "@runtime/models";
import { isTouchdown } from "@modes/classic/shared/scoring";
import { isOutOfBounds } from "@modes/classic/shared/stadium";

type MaybeKickableIdentifiedPointLike = PointLike & {
    id: number;
    isKickingBall?: boolean;
};

export function isEligibleReceiver(player: PointLike): boolean {
    return !isOutOfBounds(player);
}

function filterEligibleReceivers<T extends PointLike>(players: T[]): T[] {
    return players.filter((player) => isEligibleReceiver(player));
}

export function findEligibleBallCatcher<
    T extends MaybeKickableIdentifiedPointLike,
>(
    ball: PointLike,
    players: T[],
    maxDistance = DEFAULT_TOUCHING_DISTANCE,
): T | null {
    return findBallCatcher(ball, filterEligibleReceivers(players), maxDistance);
}

export function findTouchdownAwareBallCatcher<
    T extends MaybeKickableIdentifiedPointLike,
>(
    ball: PointLike,
    players: T[],
    offensiveTeam: FieldTeam,
    maxDistance = DEFAULT_TOUCHING_DISTANCE,
): T | null {
    return findBallCatcher(
        ball,
        players.filter(
            (player) =>
                isEligibleReceiver(player) ||
                isTouchdown({ player, offensiveTeam }),
        ),
        maxDistance,
    );
}

export function findEligibleBallCatchers<
    T extends MaybeKickableIdentifiedPointLike,
>(ball: PointLike, players: T[], maxDistance = DEFAULT_TOUCHING_DISTANCE): T[] {
    return findBallCatchers(
        ball,
        filterEligibleReceivers(players),
        maxDistance,
    );
}

export function findEligibleCatchers<
    T extends MaybeKickableIdentifiedPointLike,
>(
    a: MaybeKickableIdentifiedPointLike,
    players: T[],
    maxDistance = DEFAULT_TOUCHING_DISTANCE,
): T[] {
    return findCatchers(a, filterEligibleReceivers(players), maxDistance);
}

export function findOutOfBoundsBallCatcher<
    T extends MaybeKickableIdentifiedPointLike,
>(
    ball: PointLike,
    players: T[],
    maxDistance = DEFAULT_TOUCHING_DISTANCE,
): T | null {
    const outOfBoundsPlayers = players.filter((player) =>
        isOutOfBounds(player),
    );

    for (const player of outOfBoundsPlayers) {
        const distance = getDistance(player, ball);
        if (player.isKickingBall || distance <= maxDistance) return player;
    }

    return null;
}
