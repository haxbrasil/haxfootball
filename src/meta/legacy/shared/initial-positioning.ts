import { distributeOnLine } from "@common/math/geometry";
import { clamp } from "@common/general/helpers";
import { Team, type FieldTeam } from "@runtime/models";

export type InitialPositioningRelativeLine = {
    start: Position;
    end: Position;
};

export type InitialPositioningRelativeLines = {
    offensive: InitialPositioningRelativeLine;
    defensive: InitialPositioningRelativeLine;
};

export const DEFAULT_INITIAL_POSITIONING_RELATIVE_LINES: InitialPositioningRelativeLines =
    {
        offensive: {
            start: { x: 100, y: -250 },
            end: { x: 100, y: 250 },
        },
        defensive: {
            start: { x: -100, y: -250 },
            end: { x: -100, y: 250 },
        },
    };

export type InitialPositioningPlayer = {
    id: number;
    team: FieldTeam;
    position: Position;
};

export type InitialPositioningPlayerPosition = {
    id: number;
    x: number;
    y: number;
};

export type InitialPositioningSnapProfile = {
    playerId: number;
    averageY: number;
    count: number;
};

const byCurrentY = (
    left: InitialPositioningPlayer,
    right: InitialPositioningPlayer,
) => left.position.y - right.position.y || left.id - right.id;

const byTargetY = (
    left: {
        targetY: number;
        player: InitialPositioningPlayer;
    },
    right: {
        targetY: number;
        player: InitialPositioningPlayer;
    },
) =>
    left.targetY - right.targetY ||
    left.player.position.y - right.player.position.y ||
    left.player.id - right.player.id;

function buildSnapProfileMap(
    snapProfile: InitialPositioningSnapProfile[],
    minSnapProfileCount: number,
): Map<number, InitialPositioningSnapProfile> {
    return new Map(
        snapProfile
            .filter((profile) => profile.count >= minSnapProfileCount)
            .map((profile) => [profile.playerId, profile]),
    );
}

function interpolateByRank(
    rank: number,
    totalPlayers: number,
    knownAverageYs: number[],
): number {
    if (knownAverageYs.length === 0) return 0;
    if (knownAverageYs.length === 1) return knownAverageYs[0] ?? 0;

    const ratio = totalPlayers > 1 ? rank / (totalPlayers - 1) : 0.5;
    const scaledIndex = ratio * (knownAverageYs.length - 1);
    const lowerIndex = Math.floor(scaledIndex);
    const upperIndex = Math.min(
        knownAverageYs.length - 1,
        Math.ceil(scaledIndex),
    );
    const lower = knownAverageYs[lowerIndex] ?? 0;
    const upper = knownAverageYs[upperIndex] ?? lower;
    const factor = scaledIndex - lowerIndex;

    return lower + (upper - lower) * factor;
}

function getPlacementOrder(
    players: InitialPositioningPlayer[],
    snapProfileMap: Map<number, InitialPositioningSnapProfile>,
): InitialPositioningPlayer[] {
    const playersByCurrentY = [...players].sort(byCurrentY);

    const knownAverageYs = playersByCurrentY
        .map((player) => snapProfileMap.get(player.id))
        .filter(
            (profile): profile is InitialPositioningSnapProfile =>
                profile !== undefined,
        )
        .map((profile) => profile.averageY)
        .sort((a, b) => a - b);

    if (knownAverageYs.length === 0) {
        return playersByCurrentY;
    }

    return playersByCurrentY
        .map((player, rank) => {
            const profile = snapProfileMap.get(player.id);
            const targetY =
                profile?.averageY ??
                interpolateByRank(
                    rank,
                    playersByCurrentY.length,
                    knownAverageYs,
                );

            return {
                targetY,
                player,
            };
        })
        .sort(byTargetY)
        .map(({ player }) => player);
}

function getPlacementLine({
    ballPos,
    offensiveTeam,
    relativeLine,
}: {
    ballPos: Position;
    offensiveTeam: FieldTeam;
    relativeLine: InitialPositioningRelativeLine;
}) {
    const direction = offensiveTeam === Team.RED ? -1 : 1;

    return {
        start: {
            x: ballPos.x + relativeLine.start.x * direction,
            y: relativeLine.start.y,
        },
        end: {
            x: ballPos.x + relativeLine.end.x * direction,
            y: relativeLine.end.y,
        },
    };
}

function getClosestPointOnLineSegment({
    point,
    line,
}: {
    point: Position;
    line: {
        start: Position;
        end: Position;
    };
}): Position {
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
        return {
            x: line.start.x,
            y: line.start.y,
        };
    }

    const projection =
        ((point.x - line.start.x) * dx + (point.y - line.start.y) * dy) /
        lengthSq;
    const factor = clamp(projection, 0, 1);

    return {
        x: line.start.x + dx * factor,
        y: line.start.y + dy * factor,
    };
}

function getTeamInitialPositions({
    players,
    team,
    offensiveTeam,
    ballPos,
    relativeLine,
    snapProfileMap,
    offensiveAnchorPlayerId,
}: {
    players: InitialPositioningPlayer[];
    team: FieldTeam;
    offensiveTeam: FieldTeam;
    ballPos: Position;
    relativeLine: InitialPositioningRelativeLine;
    snapProfileMap: Map<number, InitialPositioningSnapProfile>;
    offensiveAnchorPlayerId?: number;
}): InitialPositioningPlayerPosition[] {
    const teamPlayers = players.filter((player) => player.team === team);
    const orderedPlayers = getPlacementOrder(teamPlayers, snapProfileMap);
    const placementLine = getPlacementLine({
        ballPos,
        offensiveTeam,
        relativeLine,
    });

    if (
        team !== offensiveTeam ||
        offensiveAnchorPlayerId === undefined ||
        orderedPlayers.length === 0
    ) {
        return distributeOnLine(
            orderedPlayers.map((player) => ({
                id: player.id,
                x: player.position.x,
                y: player.position.y,
            })),
            placementLine,
        ).map(({ id, x, y }) => ({ id, x, y }));
    }

    const anchorPlayer = orderedPlayers.find(
        (player) => player.id === offensiveAnchorPlayerId,
    );

    if (!anchorPlayer) {
        return distributeOnLine(
            orderedPlayers.map((player) => ({
                id: player.id,
                x: player.position.x,
                y: player.position.y,
            })),
            placementLine,
        ).map(({ id, x, y }) => ({ id, x, y }));
    }

    const anchorLinePoint = getClosestPointOnLineSegment({
        point: ballPos,
        line: placementLine,
    });

    const anchorPosition = {
        id: anchorPlayer.id,
        x: (anchorLinePoint.x + ballPos.x) / 2,
        y: (anchorLinePoint.y + ballPos.y) / 2,
    };

    const teammates = orderedPlayers.filter(
        (player) => player.id !== offensiveAnchorPlayerId,
    );
    const playersBeforeAnchor = teammates.slice(
        0,
        Math.floor(teammates.length / 2),
    );
    const playersAfterAnchor = teammates.slice(playersBeforeAnchor.length);

    const beforeAnchorPositions = distributeOnLine(
        playersBeforeAnchor.map((player) => ({
            id: player.id,
            x: player.position.x,
            y: player.position.y,
        })),
        {
            start: placementLine.start,
            end: anchorLinePoint,
        },
    ).map(({ id, x, y }) => ({ id, x, y }));

    const afterAnchorPositions = distributeOnLine(
        playersAfterAnchor.map((player) => ({
            id: player.id,
            x: player.position.x,
            y: player.position.y,
        })),
        {
            start: anchorLinePoint,
            end: placementLine.end,
        },
    ).map(({ id, x, y }) => ({ id, x, y }));

    return [...beforeAnchorPositions, anchorPosition, ...afterAnchorPositions];
}

export function buildInitialPlayerPositions({
    players,
    offensiveTeam,
    ballPos,
    relativeLines,
    snapProfile,
    minSnapProfileCount = 1,
    offensiveAnchorPlayerId,
}: {
    players: InitialPositioningPlayer[];
    offensiveTeam: FieldTeam;
    ballPos: Position;
    relativeLines: InitialPositioningRelativeLines;
    snapProfile: InitialPositioningSnapProfile[];
    minSnapProfileCount?: number;
    offensiveAnchorPlayerId?: number;
}): InitialPositioningPlayerPosition[] {
    const snapProfileMap = buildSnapProfileMap(
        snapProfile,
        minSnapProfileCount,
    );
    const defensiveTeam = offensiveTeam === Team.RED ? Team.BLUE : Team.RED;

    return [
        ...getTeamInitialPositions({
            players,
            team: offensiveTeam,
            offensiveTeam,
            ballPos,
            relativeLine: relativeLines.offensive,
            snapProfileMap,
            ...(offensiveAnchorPlayerId !== undefined
                ? { offensiveAnchorPlayerId }
                : {}),
        }),
        ...getTeamInitialPositions({
            players,
            team: defensiveTeam,
            offensiveTeam,
            ballPos,
            relativeLine: relativeLines.defensive,
            snapProfileMap,
        }),
    ];
}
