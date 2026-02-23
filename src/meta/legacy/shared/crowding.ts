import type { GameState, GameStatePlayer } from "@runtime/engine";
import { getDistance } from "@common/math/geometry";
import { ticks } from "@common/general/time";
import { DownState } from "@meta/legacy/shared/down";
import { formatNames } from "@meta/legacy/shared/message";
import { applyDefensivePenalty } from "@meta/legacy/shared/penalty";
import {
    intersectsEndZone,
    isInCrowdingArea,
    isInInnerCrowdingArea,
} from "@meta/legacy/shared/stadium";
import { unique } from "@common/general/helpers";
import { FieldTeam, Team } from "@runtime/models";
import { FieldPosition } from "@common/game/game";

const CROWDING_OUTER_FOUL_TICKS = ticks({ seconds: 3 });
const CROWDING_INNER_WEIGHT = 5;
const CROWDING_GRACE_TICKS = ticks({ seconds: 1 });
const DEFAULT_CROWDING_BLOCK_DISTANCE = 15;
export const CROWDING_PENALTY_YARDS = 5;

type CrowdingEntry = {
    playerId: number;
    startedAt: number;
    endedAt?: number;
};

export type CrowdingData = {
    outer: CrowdingEntry[];
    inner: CrowdingEntry[];
    startedAt?: number;
};

type CrowdingFoulContribution = {
    playerId: number;
    weightedTicks: number;
};

export type CrowdingFoulInfo = {
    contributions: CrowdingFoulContribution[];
    players: Array<{ id: number; name: string }>;
};

export type CrowdingEvaluation =
    | {
          updatedCrowdingData: CrowdingData;
          shouldUpdate: boolean;
          hasFoul: true;
          foulInfo: CrowdingFoulInfo;
          nextDownState: DownState;
      }
    | {
          updatedCrowdingData: CrowdingData;
          shouldUpdate: boolean;
          hasFoul: false;
          foulInfo: null;
          nextDownState: null;
      };

type DefenderCrowdingState = {
    id: number;
    inInner: boolean;
    inCrowding: boolean;
};

const isInAnyEndZone = (player: GameStatePlayer): boolean =>
    intersectsEndZone(player, Team.RED) || intersectsEndZone(player, Team.BLUE);

const createEmptyCrowdingData = (startedAt?: number): CrowdingData =>
    startedAt === undefined
        ? { outer: [], inner: [] }
        : { outer: [], inner: [], startedAt };

const updateCrowdingIntervals = (
    entries: CrowdingEntry[],
    playerIds: number[],
    tick: number,
): CrowdingEntry[] => {
    const hasOpenEntry = (playerId: number) =>
        entries.some(
            (entry) =>
                entry.playerId === playerId && entry.endedAt === undefined,
        );

    const closedEntries = entries.map((entry) => {
        if (entry.endedAt !== undefined) return entry;

        return playerIds.includes(entry.playerId)
            ? entry
            : { ...entry, endedAt: tick };
    });

    const newEntries = playerIds
        .filter((playerId) => !hasOpenEntry(playerId))
        .map((playerId) => ({ playerId, startedAt: tick }));

    return [...closedEntries, ...newEntries];
};

const getCrowdingEntryDurationTicks = (
    entry: CrowdingEntry,
    tick: number,
    minStartAt: number,
) =>
    Math.max(
        0,
        (entry.endedAt ?? tick) - Math.max(entry.startedAt, minStartAt),
    );

const sumPlayerCrowdingTicks = (
    entries: CrowdingEntry[],
    playerId: number,
    tick: number,
    minStartAt: number,
) =>
    entries
        .filter((entry) => entry.playerId === playerId)
        .map((entry) => getCrowdingEntryDurationTicks(entry, tick, minStartAt))
        .reduce((total, value) => total + value, 0);

const buildCrowdingFoulContributions = (
    data: CrowdingData,
    tick: number,
    minStartAt: number,
): Array<{ playerId: number; weightedTicks: number }> => {
    const playerIds = unique([
        ...data.outer.map((entry) => entry.playerId),
        ...data.inner.map((entry) => entry.playerId),
    ]);

    return playerIds
        .map((playerId) => {
            const outerTicks = sumPlayerCrowdingTicks(
                data.outer,
                playerId,
                tick,
                minStartAt,
            );
            const innerTicks = sumPlayerCrowdingTicks(
                data.inner,
                playerId,
                tick,
                minStartAt,
            );
            const weightedTicks =
                outerTicks + innerTicks * CROWDING_INNER_WEIGHT;

            return { playerId, weightedTicks };
        })
        .filter((entry) => entry.weightedTicks > 0);
};

const getCrowdingDefenderBlockDistance = (player: GameStatePlayer) =>
    player.radius > 0 ? player.radius : DEFAULT_CROWDING_BLOCK_DISTANCE;

const isCrowdingDefenderBlocked = (
    defensivePlayer: GameStatePlayer,
    offensivePlayers: GameStatePlayer[],
) =>
    offensivePlayers.some(
        (offensivePlayer) =>
            getDistance(offensivePlayer, defensivePlayer) <=
            getCrowdingDefenderBlockDistance(defensivePlayer),
    );

const getDefenderCrowdingState = (
    player: GameStatePlayer,
    offensivePlayers: GameStatePlayer[],
    offensiveTeam: FieldTeam,
    fieldPos: FieldPosition,
): DefenderCrowdingState => {
    const isBlocked = isCrowdingDefenderBlocked(player, offensivePlayers);
    const inInner =
        !isBlocked && isInInnerCrowdingArea(player, offensiveTeam, fieldPos);
    const inCrowding =
        !isBlocked &&
        (inInner || isInCrowdingArea(player, offensiveTeam, fieldPos));

    return { id: player.id, inInner, inCrowding };
};

const sameCrowdingEntry = (left: CrowdingEntry, right: CrowdingEntry) =>
    left.playerId === right.playerId &&
    left.startedAt === right.startedAt &&
    left.endedAt === right.endedAt;

const sameCrowdingEntries = (left: CrowdingEntry[], right: CrowdingEntry[]) =>
    left.length === right.length &&
    left.every((entry, index) => {
        const other = right[index];
        return other ? sameCrowdingEntry(entry, other) : false;
    });

const sameCrowdingData = (left: CrowdingData, right: CrowdingData) =>
    left.startedAt === right.startedAt &&
    sameCrowdingEntries(left.outer, right.outer) &&
    sameCrowdingEntries(left.inner, right.inner);

export const evaluateCrowding = ({
    state,
    quarterbackId,
    downState,
    crowdingData,
}: {
    state: GameState;
    quarterbackId: number;
    downState: DownState;
    crowdingData: CrowdingData;
}): CrowdingEvaluation => {
    const { offensiveTeam, fieldPos } = downState;
    const crowdingWindowStartTick = crowdingData.startedAt ?? state.tickNumber;
    const graceWindowEndsAtTick =
        crowdingWindowStartTick + CROWDING_GRACE_TICKS;

    const nonQuarterbacks = state.players.filter(
        (player) => player.id !== quarterbackId,
    );
    const offensePlayers = nonQuarterbacks.filter(
        (player) => player.team === offensiveTeam,
    );
    const defensePlayers = nonQuarterbacks.filter(
        (player) => player.team !== offensiveTeam && !isInAnyEndZone(player),
    );

    const offenseInCrowdingArea = offensePlayers.some((player) =>
        isInCrowdingArea(player, offensiveTeam, fieldPos),
    );

    const defenderCrowdingStates = defensePlayers.map((player) =>
        getDefenderCrowdingState(
            player,
            offensePlayers,
            offensiveTeam,
            fieldPos,
        ),
    );

    const innerZoneDefenderIds = defenderCrowdingStates
        .filter((status) => status.inInner)
        .map((status) => status.id);

    const outerZoneDefenderIds = defenderCrowdingStates
        .filter((status) => status.inCrowding && !status.inInner)
        .map((status) => status.id);

    const hasDefenderInCrowdingZone = defenderCrowdingStates.some(
        (status) => status.inCrowding,
    );

    const shouldRestartCrowdingWindow =
        offenseInCrowdingArea || !hasDefenderInCrowdingZone;

    const updatedCrowdingData = shouldRestartCrowdingWindow
        ? createEmptyCrowdingData(crowdingWindowStartTick)
        : {
              outer: updateCrowdingIntervals(
                  crowdingData.outer,
                  outerZoneDefenderIds,
                  state.tickNumber,
              ),
              inner: updateCrowdingIntervals(
                  crowdingData.inner,
                  innerZoneDefenderIds,
                  state.tickNumber,
              ),
              startedAt: crowdingWindowStartTick,
          };

    const crowdingFoulContributions = shouldRestartCrowdingWindow
        ? []
        : buildCrowdingFoulContributions(
              updatedCrowdingData,
              state.tickNumber,
              graceWindowEndsAtTick,
          );

    const totalWeightedCrowdingFoulTicks = crowdingFoulContributions.reduce(
        (total, entry) => total + entry.weightedTicks,
        0,
    );

    const isCrowdingFoul =
        !shouldRestartCrowdingWindow &&
        totalWeightedCrowdingFoulTicks >= CROWDING_OUTER_FOUL_TICKS;

    const shouldRefreshCrowdingData = !sameCrowdingData(
        crowdingData,
        updatedCrowdingData,
    );

    const evaluationBase = {
        updatedCrowdingData,
        shouldUpdate: shouldRefreshCrowdingData,
    };

    return isCrowdingFoul
        ? {
              ...evaluationBase,
              hasFoul: true,
              foulInfo: {
                  contributions: crowdingFoulContributions,
                  players: state.players,
              },
              nextDownState: applyDefensivePenalty(
                  downState,
                  CROWDING_PENALTY_YARDS,
              ).downState,
          }
        : {
              ...evaluationBase,
              hasFoul: false,
              foulInfo: null,
              nextDownState: null,
          };
};

export const getCrowdingOffenderNames = (info: CrowdingFoulInfo): string => {
    const offenderContributions = info.contributions.filter(
        (entry) => entry.weightedTicks > 0,
    );

    const totalWeightedTicks = offenderContributions.reduce(
        (total, entry) => total + entry.weightedTicks,
        0,
    );

    const offenderSummaryText = formatNames(
        offenderContributions.map(({ playerId, weightedTicks }) => {
            const playerName =
                info.players.find((player) => player.id === playerId)?.name ??
                "Unknown";
            const percent =
                totalWeightedTicks > 0
                    ? Math.round((weightedTicks / totalWeightedTicks) * 100)
                    : 0;
            return { name: `${playerName} (${percent}%)` };
        }),
    );

    return offenderSummaryText;
};
