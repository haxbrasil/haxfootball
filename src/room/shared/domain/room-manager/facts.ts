import { GAME_MODE, type GameModeName } from "@modes/types";
import { Team, type FieldTeam, isFieldTeam } from "@runtime/models";
import type {
    DesiredRoomMode,
    RoomManagementPlayer,
    RoomManagementSnapshot,
    RoomManagerState,
    RoomRosterPlayer,
} from "./types";

export type ManagerContext = {
    snapshot: RoomManagementSnapshot;
    state: RoomManagerState;
    afkPlayerIds: ReadonlySet<number>;
    playablePlayers: readonly RoomManagementPlayer[];
    availablePlayers: readonly RoomManagementPlayer[];
    fieldPlayers: readonly RoomManagementPlayer[];
    ineligibleFieldPlayers: readonly RoomManagementPlayer[];
    desiredMode: DesiredRoomMode;
    desiredGameMode: GameModeName | null;
    desiredRoster: readonly RoomRosterPlayer[];
    waitingPlayerIds: readonly number[];
    modeSyncSnapshotKey: string;
    canApplyVisibleGameChange: boolean;
    facts: readonly string[];
};

export function getDesiredRoomMode(playerCount: number): DesiredRoomMode {
    if (playerCount === 0) return "idle";
    if (playerCount < 4) return "training";
    if (playerCount < 8) return "flag";
    return "classic";
}

export function getGameModeForDesired(
    desiredMode: DesiredRoomMode,
): GameModeName | null {
    switch (desiredMode) {
        case "idle":
            return null;
        case "training":
            return GAME_MODE.TRAINING;
        case "flag":
            return GAME_MODE.FLAG;
        case "classic":
            return GAME_MODE.CLASSIC;
    }
}

export function getDesiredRosterSize(
    desiredMode: DesiredRoomMode,
    availableCount: number,
): number {
    switch (desiredMode) {
        case "idle":
            return 0;
        case "training":
            return availableCount;
        case "flag":
            return availableCount >= 6 ? 6 : 4;
        case "classic":
            return 8;
    }
}

export function buildDesiredRoster(
    desiredMode: DesiredRoomMode,
    availablePlayers: readonly RoomManagementPlayer[],
    snapshot?: RoomManagementSnapshot,
    state?: RoomManagerState,
): readonly RoomRosterPlayer[] {
    const rotatedRoster = buildCompletedResultRoster(
        desiredMode,
        availablePlayers,
        snapshot,
        state,
    );
    if (rotatedRoster) return rotatedRoster;

    const preservedActiveRoster = buildPreservedActiveRoster(
        desiredMode,
        availablePlayers,
        state,
    );
    if (preservedActiveRoster) return preservedActiveRoster;

    const rosterSize = getDesiredRosterSize(
        desiredMode,
        availablePlayers.length,
    );
    const selectedPlayers = availablePlayers.slice(0, rosterSize);

    if (desiredMode === "training") {
        const currentFieldPlayers = selectedPlayers.reduce<
            Array<{ playerId: number; team: FieldTeam }>
        >((players, player) => {
            if (!isFieldTeam(player.team)) return players;

            return [
                ...players,
                {
                    playerId: player.id,
                    team: player.team === Team.RED ? Team.RED : Team.BLUE,
                },
            ];
        }, []);
        const spectatorPlayers = selectedPlayers.filter(
            (player) => !isFieldTeam(player.team),
        );

        return [
            ...currentFieldPlayers.map((player, index) => ({
                playerId: player.playerId,
                team: player.team,
                order: index,
            })),
            ...spectatorPlayers.map((player, index) => {
                const order = currentFieldPlayers.length + index;

                return {
                    playerId: player.id,
                    team: getTrainingTeam(order),
                    order,
                };
            }),
        ];
    }

    return selectedPlayers.map((player, index) => ({
        playerId: player.id,
        team: getSnakeTeam(index),
        order: index,
    }));
}

export function getCompletedResultKey(
    result: RoomManagementSnapshot["game"]["result"],
): string | null {
    if (!result) return null;

    return [
        result.winnerTeam,
        result.loserTeam,
        result.finalScore[Team.RED],
        result.finalScore[Team.BLUE],
        result.reason,
        result.elapsedSeconds,
    ].join("|");
}

function buildCompletedResultRoster(
    desiredMode: DesiredRoomMode,
    availablePlayers: readonly RoomManagementPlayer[],
    snapshot?: RoomManagementSnapshot,
    state?: RoomManagerState,
): readonly RoomRosterPlayer[] | null {
    const result = snapshot?.game.result ?? null;
    const resultKey = getCompletedResultKey(result);
    if (!result || !resultKey) return null;
    if (!state?.activeRoster) return null;
    if (state.activeRoster.mode !== desiredMode) return null;
    if (state.lastCompletedResultKey === resultKey) return null;
    if (desiredMode !== "flag" && desiredMode !== "classic") return null;

    const rosterSize = getDesiredRosterSize(
        desiredMode,
        availablePlayers.length,
    );
    const teamSize = rosterSize / 2;
    const availableById = new Set(availablePlayers.map((player) => player.id));
    const activeRosterIds = new Set(
        state.activeRoster.players.map((player) => player.playerId),
    );
    const winners = state.activeRoster.players
        .filter(
            (player) =>
                player.team === result.winnerTeam &&
                availableById.has(player.playerId),
        )
        .slice(0, teamSize);
    const loserPlayerIds = new Set(
        state.activeRoster.players
            .filter((player) => player.team === result.loserTeam)
            .map((player) => player.playerId),
    );
    const waitingPlayers = availablePlayers.filter(
        (player) => !activeRosterIds.has(player.id),
    );
    const loserPlayers = availablePlayers.filter((player) =>
        loserPlayerIds.has(player.id),
    );
    const replacementPlayers = [...waitingPlayers, ...loserPlayers].slice(
        0,
        teamSize,
    );

    if (winners.length + replacementPlayers.length < rosterSize) {
        return null;
    }

    return [
        ...winners.map((player, order) => ({
            playerId: player.playerId,
            team: result.winnerTeam,
            order,
        })),
        ...replacementPlayers.map((player, index) => ({
            playerId: player.id,
            team: result.loserTeam,
            order: winners.length + index,
        })),
    ];
}

function buildPreservedActiveRoster(
    desiredMode: DesiredRoomMode,
    availablePlayers: readonly RoomManagementPlayer[],
    state?: RoomManagerState,
): readonly RoomRosterPlayer[] | null {
    if (!state?.activeRoster) return null;
    if (state.activeRoster.mode !== desiredMode) return null;

    const rosterSize = getDesiredRosterSize(
        desiredMode,
        availablePlayers.length,
    );
    const availablePlayerIds = new Set(
        availablePlayers.map((player) => player.id),
    );
    const preservedPlayers = state.activeRoster.players.filter((player) =>
        availablePlayerIds.has(player.playerId),
    );

    if (preservedPlayers.length !== rosterSize) return null;

    return preservedPlayers;
}

export function getSnakeTeam(index: number): FieldTeam {
    return index % 4 === 0 || index % 4 === 3 ? Team.RED : Team.BLUE;
}

function getTrainingTeam(index: number): FieldTeam {
    return index % 2 === 0 ? Team.RED : Team.BLUE;
}

function orderAvailablePlayers(
    availablePlayers: readonly RoomManagementPlayer[],
    snapshot: RoomManagementSnapshot,
    state: RoomManagerState,
): readonly RoomManagementPlayer[] {
    const availablePlayersById = new Map(
        availablePlayers.map((player) => [player.id, player]),
    );
    const activeRosterPlayers =
        state.activeRoster?.players.flatMap((rosterPlayer) => {
            const player = availablePlayersById.get(rosterPlayer.playerId);

            return player ? [player] : [];
        }) ?? [];
    const activeRosterPlayerIds = new Set(
        activeRosterPlayers.map((player) => player.id),
    );
    const remainingPlayers = snapshot.players.filter(
        (player) =>
            availablePlayersById.has(player.id) &&
            !activeRosterPlayerIds.has(player.id),
    );

    return [...activeRosterPlayers, ...remainingPlayers];
}

export function isBeforePlayStart(snapshot: RoomManagementSnapshot): boolean {
    return snapshot.game.inspection?.continuity === "before-play-start";
}

export function canApplyVisibleGameChange(
    snapshot: RoomManagementSnapshot,
): boolean {
    if (!snapshot.game.running) return true;
    if (snapshot.game.activeMode === GAME_MODE.TRAINING) return true;
    return isBeforePlayStart(snapshot);
}

export function needsModeSync(ctx: ManagerContext): boolean {
    if (ctx.desiredMode === "idle") {
        return ctx.snapshot.game.running || ctx.fieldPlayers.length > 0;
    }

    if (ctx.snapshot.game.selectedMode !== ctx.desiredGameMode) {
        return true;
    }

    if (!ctx.snapshot.game.running) {
        return true;
    }

    if (ctx.snapshot.game.activeMode !== ctx.desiredGameMode) {
        return true;
    }

    const currentFieldById = new Map(
        ctx.fieldPlayers.map((player) => [player.id, player.team]),
    );

    return ctx.desiredRoster.some(
        (rosterPlayer) =>
            currentFieldById.get(rosterPlayer.playerId) !== rosterPlayer.team,
    );
}

export function deriveManagerContext(
    snapshot: RoomManagementSnapshot,
    state: RoomManagerState,
): ManagerContext {
    const afkPlayerIds = new Set([
        ...state.manualAfkPlayerIds,
        ...state.autoAfkPlayerIds,
    ]);
    const playablePlayers = snapshot.players.filter(
        (player) => player.playable,
    );
    const availablePlayers = orderAvailablePlayers(
        playablePlayers.filter((player) => !afkPlayerIds.has(player.id)),
        snapshot,
        state,
    );
    const fieldPlayers = snapshot.players.filter((player) =>
        isFieldTeam(player.team),
    );
    const ineligibleFieldPlayers = fieldPlayers.filter(
        (player) => !player.playable,
    );
    const desiredMode = getDesiredRoomMode(availablePlayers.length);
    const desiredGameMode = getGameModeForDesired(desiredMode);
    const desiredRoster = buildDesiredRoster(
        desiredMode,
        availablePlayers,
        snapshot,
        state,
    );
    const desiredRosterIds = new Set(
        desiredRoster.map((player) => player.playerId),
    );
    const waitingPlayerIds = availablePlayers
        .filter((player) => !desiredRosterIds.has(player.id))
        .map((player) => player.id);
    const modeSyncSnapshotKey = [
        desiredMode,
        availablePlayers.map((player) => player.id).join(","),
        snapshot.game.running ? "running" : "stopped",
        snapshot.game.selectedMode,
        snapshot.game.activeMode ?? "none",
    ].join("|");

    return {
        snapshot,
        state,
        afkPlayerIds,
        playablePlayers,
        availablePlayers,
        fieldPlayers,
        ineligibleFieldPlayers,
        desiredMode,
        desiredGameMode,
        desiredRoster,
        waitingPlayerIds,
        modeSyncSnapshotKey,
        canApplyVisibleGameChange: canApplyVisibleGameChange(snapshot),
        facts: [
            `available=${availablePlayers.length}`,
            `desired=${desiredMode}`,
            `selected=${snapshot.game.selectedMode}`,
            `active=${snapshot.game.activeMode ?? "none"}`,
            `continuity=${snapshot.game.inspection?.continuity ?? "unknown"}`,
        ],
    };
}
