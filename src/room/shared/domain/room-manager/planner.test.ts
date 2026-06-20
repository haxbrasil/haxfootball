import { describe, expect, it } from "vitest";
import { GAME_MODE } from "@modes/types";
import { Team } from "@runtime/models";
import type { GameRuntimeSnapshot } from "../game-runtime";
import {
    DEFAULT_ROOM_MANAGER_STATE,
    planRoomManagement,
    type RoomManagementPlayer,
    type RoomManagementSnapshot,
    type RoomManagerState,
} from ".";

const createState = (): RoomManagerState => ({
    ...DEFAULT_ROOM_MANAGER_STATE,
    afkPlayerIds: [],
    lastActivity: [],
});

const createGame = (
    patch: Partial<GameRuntimeSnapshot> = {},
): GameRuntimeSnapshot => ({
    selectedMode: GAME_MODE.TRAINING,
    activeMode: null,
    running: false,
    paused: false,
    inspection: null,
    diagnosticStateKey: null,
    checkpoints: [],
    score: null,
    result: null,
    ...patch,
});

const createPlayer = (
    id: number,
    patch: Partial<RoomManagementPlayer> = {},
): RoomManagementPlayer => ({
    id,
    name: `Player ${id}`,
    team: Team.SPECTATORS,
    admin: false,
    playable: true,
    playBlockedReason: "none",
    ...patch,
});

const createSnapshot = ({
    nowMs = 0,
    players,
    game = createGame(),
    enabled = true,
    managedRoom = true,
    teamsLocked = true,
    visibleActionDelayMs = 1_000,
    afkActivityDetectionEnabled = true,
}: {
    nowMs?: number;
    players: readonly RoomManagementPlayer[];
    game?: GameRuntimeSnapshot;
    enabled?: boolean;
    managedRoom?: boolean;
    teamsLocked?: boolean;
    visibleActionDelayMs?: number;
    afkActivityDetectionEnabled?: boolean;
}): RoomManagementSnapshot => ({
    nowMs,
    players,
    teamsLocked,
    game,
    config: {
        enabled,
        managedRoom,
        visibleActionDelayMs,
        afkActivityDetectionEnabled,
    },
});

describe("planRoomManagement", () => {
    it("schedules an 8-player Classic switch with a one-second delay", () => {
        const decision = planRoomManagement(
            createSnapshot({
                players: Array.from({ length: 8 }, (_, index) =>
                    createPlayer(index + 1),
                ),
            }),
            createState(),
        );

        expect(decision.actions).toEqual([]);
        expect(decision.state.pendingVisibleAction).toMatchObject({
            kind: "mode-sync",
            desiredMode: "classic",
            executeAtMs: 1_000,
        });
        expect(decision.trace.matchedRules).toContain("thresholdChangeRule");
    });

    it("coalesces a 7-to-8 player join into the latest pending decision", () => {
        const sevenPlayerDecision = planRoomManagement(
            createSnapshot({
                players: Array.from({ length: 7 }, (_, index) =>
                    createPlayer(index + 1),
                ),
            }),
            createState(),
        );

        const eightPlayerDecision = planRoomManagement(
            createSnapshot({
                nowMs: 500,
                players: Array.from({ length: 8 }, (_, index) =>
                    createPlayer(index + 1),
                ),
            }),
            sevenPlayerDecision.state,
        );

        expect(eightPlayerDecision.actions).toEqual([]);
        expect(eightPlayerDecision.state.pendingVisibleAction).toMatchObject({
            desiredMode: "classic",
            executeAtMs: 1_500,
        });
        expect(eightPlayerDecision.trace.reason).toBe(
            "pending mode sync coalesced",
        );
    });

    it("executes the pending mode switch from the latest snapshot", () => {
        const scheduled = planRoomManagement(
            createSnapshot({
                players: Array.from({ length: 8 }, (_, index) =>
                    createPlayer(index + 1),
                ),
            }),
            createState(),
        );

        const due = planRoomManagement(
            createSnapshot({
                nowMs: 1_000,
                players: Array.from({ length: 8 }, (_, index) =>
                    createPlayer(index + 1),
                ),
            }),
            scheduled.state,
        );

        expect(due.actions).toContainEqual({
            type: "set-mode",
            mode: GAME_MODE.CLASSIC,
        });
        expect(due.actions).toContainEqual({ type: "start-game" });
        expect(due.state.pendingVisibleAction).toBeNull();
        expect(due.state.activeRoster?.players).toHaveLength(8);
    });

    it("separates a running mode restart into stop and later start decisions", () => {
        const players = Array.from({ length: 4 }, (_, index) =>
            createPlayer(index + 1),
        );
        const runningTraining = createGame({
            selectedMode: GAME_MODE.TRAINING,
            activeMode: GAME_MODE.TRAINING,
            running: true,
            inspection: { continuity: "before-play-start" },
        });
        const scheduled = planRoomManagement(
            createSnapshot({
                players,
                game: runningTraining,
            }),
            createState(),
        );

        const stopDecision = planRoomManagement(
            createSnapshot({
                nowMs: 1_000,
                players,
                game: runningTraining,
            }),
            scheduled.state,
        );

        expect(stopDecision.actions).toContainEqual({
            type: "stop-game",
            reason: "mode-sync",
        });
        expect(stopDecision.actions).not.toContainEqual({
            type: "start-game",
        });
        expect(stopDecision.state.pendingVisibleAction).toMatchObject({
            stage: "after-stop",
            desiredMode: "flag",
            executeAtMs: 2_000,
        });

        const settleDecision = planRoomManagement(
            createSnapshot({
                nowMs: 1_500,
                players,
                game: createGame({
                    selectedMode: GAME_MODE.TRAINING,
                    activeMode: null,
                    running: false,
                }),
            }),
            stopDecision.state,
        );

        expect(settleDecision.actions).toEqual([]);
        expect(settleDecision.trace.reason).toBe(
            "pending visible action waiting",
        );

        const startDecision = planRoomManagement(
            createSnapshot({
                nowMs: 2_000,
                players,
                game: createGame({
                    selectedMode: GAME_MODE.TRAINING,
                    activeMode: null,
                    running: false,
                }),
            }),
            settleDecision.state,
        );

        expect(startDecision.actions).toContainEqual({
            type: "set-mode",
            mode: GAME_MODE.FLAG,
        });
        expect(startDecision.actions).toContainEqual({
            type: "start-game",
        });
        expect(startDecision.actions).not.toContainEqual({
            type: "stop-game",
            reason: "mode-sync",
        });
    });

    it("does not announce the mode again for a Training roster-only sync", () => {
        const decision = planRoomManagement(
            createSnapshot({
                visibleActionDelayMs: 0,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.TRAINING,
                    activeMode: GAME_MODE.TRAINING,
                    running: true,
                }),
            }),
            createState(),
        );

        expect(decision.actions).toContainEqual({
            type: "move-player",
            playerId: 2,
            team: Team.BLUE,
            reason: "mode-roster",
        });
        expect(decision.actions).not.toContainEqual({
            type: "send-message",
            to: "room",
            message: { id: "manager.mode.training" },
        });
    });

    it("waits for before-play-start before applying an active-match threshold switch", () => {
        const liveGame = createGame({
            selectedMode: GAME_MODE.FLAG,
            activeMode: GAME_MODE.FLAG,
            running: true,
            inspection: { continuity: "play-started" },
        });
        const scheduled = planRoomManagement(
            createSnapshot({
                players: Array.from({ length: 8 }, (_, index) =>
                    createPlayer(index + 1),
                ),
                game: liveGame,
            }),
            createState(),
        );

        const stillLive = planRoomManagement(
            createSnapshot({
                nowMs: 1_000,
                players: Array.from({ length: 8 }, (_, index) =>
                    createPlayer(index + 1),
                ),
                game: liveGame,
            }),
            scheduled.state,
        );

        expect(stillLive.actions).toEqual([]);
        expect(stillLive.state.pendingVisibleAction).not.toBeNull();
        expect(stillLive.trace.reason).toBe("waiting for game boundary");

        const beforePlayStart = planRoomManagement(
            createSnapshot({
                nowMs: 1_000,
                players: Array.from({ length: 8 }, (_, index) =>
                    createPlayer(index + 1),
                ),
                game: {
                    ...liveGame,
                    inspection: { continuity: "before-play-start" },
                },
            }),
            stillLive.state,
        );

        expect(beforePlayStart.actions).toContainEqual({
            type: "stop-game",
            reason: "mode-sync",
        });
        expect(beforePlayStart.actions).not.toContainEqual({
            type: "start-game",
        });
        expect(beforePlayStart.trace.reason).toBe(
            "mode sync stopping current game",
        );

        const afterStop = planRoomManagement(
            createSnapshot({
                nowMs: 2_000,
                players: Array.from({ length: 8 }, (_, index) =>
                    createPlayer(index + 1),
                ),
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: null,
                    running: false,
                }),
            }),
            beforePlayStart.state,
        );

        expect(afterStop.actions).toContainEqual({
            type: "set-mode",
            mode: GAME_MODE.CLASSIC,
        });
        expect(afterStop.actions).toContainEqual({
            type: "start-game",
        });
    });

    it("moves ineligible managed players back to spectators even when automation is disabled", () => {
        const decision = planRoomManagement(
            createSnapshot({
                enabled: false,
                players: [
                    createPlayer(1, {
                        team: Team.RED,
                        playable: false,
                        playBlockedReason: "guest",
                    }),
                ],
            }),
            {
                ...createState(),
                status: "disabled",
            },
        );

        expect(decision.actions).toContainEqual({
            type: "move-player",
            playerId: 1,
            team: Team.SPECTATORS,
            reason: "ineligible",
        });
        expect(decision.actions).toContainEqual({
            type: "send-message",
            to: 1,
            message: { id: "manager.eligibility.register" },
        });
    });

    it("pauses and warns once when an active player is inactive for five seconds", () => {
        const decision = planRoomManagement(
            createSnapshot({
                nowMs: 5_000,
                players: [createPlayer(1, { team: Team.RED })],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    inspection: { continuity: "before-play-start" },
                }),
            }),
            {
                ...createState(),
                activeRoster: {
                    mode: "classic",
                    startedAtMs: 0,
                    players: [{ playerId: 1, team: Team.RED, order: 0 }],
                },
                lastActivity: [{ playerId: 1, atMs: 0 }],
            },
        );

        expect(decision.actions).toContainEqual({
            type: "pause-game",
            paused: true,
            reason: "afk-warning",
        });
        expect(decision.state.afkWarningPlayerIds).toEqual([1]);
    });

    it("moves and marks AFK when inactivity reaches fifteen seconds", () => {
        const decision = planRoomManagement(
            createSnapshot({
                nowMs: 15_000,
                players: [createPlayer(1, { team: Team.RED })],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    inspection: { continuity: "play-started" },
                }),
            }),
            {
                ...createState(),
                activeRoster: {
                    mode: "classic",
                    startedAtMs: 0,
                    players: [{ playerId: 1, team: Team.RED, order: 0 }],
                },
                afkWarningPlayerIds: [1],
                lastActivity: [{ playerId: 1, atMs: 0 }],
            },
        );

        expect(decision.actions).toContainEqual({
            type: "move-player",
            playerId: 1,
            team: Team.SPECTATORS,
            reason: "afk",
        });
        expect(decision.state.afkPlayerIds).toEqual([1]);
    });

    it("skips automatic AFK timers when AFK activity detection is disabled", () => {
        const decision = planRoomManagement(
            createSnapshot({
                nowMs: 15_000,
                afkActivityDetectionEnabled: false,
                players: [createPlayer(1, { team: Team.RED })],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    inspection: { continuity: "play-started" },
                }),
            }),
            {
                ...createState(),
                activeRoster: {
                    mode: "classic",
                    startedAtMs: 0,
                    players: [{ playerId: 1, team: Team.RED, order: 0 }],
                },
                lastActivity: [{ playerId: 1, atMs: 0 }],
            },
        );

        expect(decision.actions).not.toContainEqual({
            type: "pause-game",
            paused: true,
            reason: "afk-warning",
        });
        expect(decision.actions).not.toContainEqual({
            type: "move-player",
            playerId: 1,
            team: Team.SPECTATORS,
            reason: "afk",
        });
        expect(decision.state.afkPlayerIds).toEqual([]);
        expect(decision.state.afkWarningPlayerIds).toEqual([]);
    });

    it("clears readiness without moving inactive players when AFK activity detection is disabled", () => {
        const decision = planRoomManagement(
            createSnapshot({
                nowMs: 20_000,
                afkActivityDetectionEnabled: false,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2, { team: Team.BLUE }),
                    createPlayer(3, { team: Team.BLUE }),
                    createPlayer(4, { team: Team.RED }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: GAME_MODE.FLAG,
                    running: true,
                    inspection: { continuity: "before-play-start" },
                }),
            }),
            {
                ...createState(),
                readiness: {
                    matchStartedAtMs: 0,
                    waitingPlayerIds: [1, 2, 3, 4],
                    blockerActive: true,
                    warningSentPlayerIds: [1, 2, 3, 4],
                },
            },
        );

        expect(decision.trace.reason).toBe("readiness skipped");
        expect(decision.actions).not.toContainEqual({
            type: "move-player",
            playerId: 1,
            team: Team.SPECTATORS,
            reason: "afk",
        });
        expect(decision.state.readiness).toBeNull();
    });

    it("clears readiness without warning players outside Flag and Classic", () => {
        const decision = planRoomManagement(
            createSnapshot({
                nowMs: 20_000,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2, { team: Team.BLUE }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.TRAINING,
                    activeMode: GAME_MODE.TRAINING,
                    running: true,
                }),
            }),
            {
                ...createState(),
                readiness: {
                    matchStartedAtMs: 0,
                    waitingPlayerIds: [1, 2],
                    blockerActive: true,
                    warningSentPlayerIds: [],
                },
            },
        );

        expect(decision.trace.reason).toBe(
            "readiness cleared outside match mode",
        );
        expect(decision.actions).toContainEqual({
            type: "set-pre-play-timeout-hold",
            held: false,
        });
        expect(decision.actions).toContainEqual({
            type: "set-readiness-blocker",
            active: false,
        });
        expect(decision.actions).not.toContainEqual({
            type: "send-message",
            to: 1,
            message: { id: "manager.readiness.waiting" },
        });
        expect(decision.actions).not.toContainEqual({
            type: "move-player",
            playerId: 1,
            team: Team.SPECTATORS,
            reason: "afk",
        });
        expect(decision.state.readiness).toBeNull();
    });

    it("replaces a missing active-roster player from the spectator queue", () => {
        const players = Array.from({ length: 8 }, (_, index) =>
            createPlayer(index + 2, {
                team: index < 7 ? Team.RED : Team.SPECTATORS,
            }),
        );
        const decision = planRoomManagement(
            createSnapshot({
                players,
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    inspection: { continuity: "play-started" },
                }),
            }),
            {
                ...createState(),
                activeRoster: {
                    mode: "classic",
                    startedAtMs: 0,
                    players: [
                        { playerId: 1, team: Team.RED, order: 0 },
                        { playerId: 2, team: Team.BLUE, order: 1 },
                    ],
                },
                shortage: {
                    missingPlayerId: 1,
                    missingPlayerName: "Player 1",
                    previousTeam: Team.RED,
                    replacementPlayerId: null,
                    replacementAtMs: 0,
                    originalReturnExpiresAtMs: 30_000,
                },
            },
        );

        expect(decision.actions).toContainEqual({
            type: "move-player",
            playerId: 9,
            team: Team.RED,
            reason: "shortage",
        });
        expect(decision.actions).toContainEqual({
            type: "send-message",
            to: "room",
            message: {
                id: "manager.shortage.replaced",
                args: {
                    missingPlayerId: 1,
                    missingPlayerName: "Player 1",
                    replacementPlayerId: 9,
                    replacementPlayerName: "Player 9",
                    replacementTeam: Team.RED,
                },
            },
        });
        expect(decision.state.shortage?.replacementPlayerId).toBe(9);
    });

    it("does not resend a shortage replacement while the selected replacement is pending", () => {
        const decision = planRoomManagement(
            createSnapshot({
                players: [
                    createPlayer(2, { team: Team.BLUE }),
                    createPlayer(9, { team: Team.SPECTATORS }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    inspection: { continuity: "before-play-start" },
                }),
            }),
            {
                ...createState(),
                activeRoster: {
                    mode: "classic",
                    startedAtMs: 0,
                    players: [
                        { playerId: 9, team: Team.RED, order: 0 },
                        { playerId: 2, team: Team.BLUE, order: 1 },
                    ],
                },
                shortage: {
                    missingPlayerId: 1,
                    missingPlayerName: "Player 1",
                    previousTeam: Team.RED,
                    replacementPlayerId: 9,
                    replacementAtMs: 0,
                    originalReturnExpiresAtMs: 30_000,
                },
            },
        );

        expect(decision.actions).toEqual([]);
        expect(decision.trace.reason).toBe(
            "waiting for shortage replacement move",
        );
        expect(decision.state.shortage?.replacementPlayerId).toBe(9);
    });

    it("restores the original player at a before-play-start boundary", () => {
        const decision = planRoomManagement(
            createSnapshot({
                nowMs: 10_000,
                players: [createPlayer(1), createPlayer(9, { team: Team.RED })],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    inspection: { continuity: "before-play-start" },
                }),
            }),
            {
                ...createState(),
                activeRoster: {
                    mode: "classic",
                    startedAtMs: 0,
                    players: [{ playerId: 9, team: Team.RED, order: 0 }],
                },
                shortage: {
                    missingPlayerId: 1,
                    missingPlayerName: "Player 1",
                    previousTeam: Team.RED,
                    replacementPlayerId: 9,
                    replacementAtMs: 0,
                    originalReturnExpiresAtMs: 30_000,
                },
            },
        );

        expect(decision.actions).toContainEqual({
            type: "move-player",
            playerId: 1,
            team: Team.RED,
            reason: "restore-original",
        });
        expect(decision.actions).toContainEqual({
            type: "move-player",
            playerId: 9,
            team: Team.SPECTATORS,
            reason: "restore-original",
        });
        expect(decision.state.shortage).toBeNull();
    });

    it("uses unconsumed completed results for winner-stays rotation", () => {
        const decision = planRoomManagement(
            createSnapshot({
                visibleActionDelayMs: 0,
                players: [1, 2, 3, 4, 5].map((id) => createPlayer(id)),
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: null,
                    running: false,
                    result: {
                        status: "complete",
                        expectedTimeReached: true,
                        overage: false,
                        winnerTeam: Team.RED,
                        loserTeam: Team.BLUE,
                        finalScore: {
                            [Team.RED]: 7,
                            [Team.BLUE]: 0,
                        },
                        reason: "regulation-ended",
                        elapsedSeconds: 420,
                    },
                }),
            }),
            {
                ...createState(),
                activeRoster: {
                    mode: "flag",
                    startedAtMs: 0,
                    players: [
                        { playerId: 1, team: Team.RED, order: 0 },
                        { playerId: 2, team: Team.RED, order: 1 },
                        { playerId: 3, team: Team.BLUE, order: 2 },
                        { playerId: 4, team: Team.BLUE, order: 3 },
                    ],
                },
            },
        );

        expect(decision.state.activeRoster?.players).toEqual([
            { playerId: 1, team: Team.RED, order: 0 },
            { playerId: 2, team: Team.RED, order: 1 },
            { playerId: 5, team: Team.BLUE, order: 2 },
            { playerId: 3, team: Team.BLUE, order: 3 },
        ]);
        expect(decision.state.lastCompletedResultKey).not.toBeNull();
    });
});
