import { describe, expect, it } from "vitest";
import { GAME_MODE } from "@modes/types";
import { Team, type FieldTeam } from "@runtime/models";
import type { GameRuntimeSnapshot } from "../game-runtime";
import {
    DEFAULT_ROOM_MANAGER_STATE,
    planRoomManagement,
    recordGameStart,
    recordPlayerActivity,
    type RoomManagementAction,
    type RoomManagementPlayer,
    type RoomManagementSnapshot,
    type RoomManagerState,
} from ".";

const RED_TEAM: FieldTeam = Team.RED;
const BLUE_TEAM: FieldTeam = Team.BLUE;

const createState = (): RoomManagerState => ({
    ...DEFAULT_ROOM_MANAGER_STATE,
    manualAfkPlayerIds: [],
    autoAfkPlayerIds: [],
    afkWarningPlayerIds: [],
    afkPausedPlayerIds: [],
    afkPauseBaseline: [],
    afkReminderAt: [],
    lastActivity: [],
    checkedPrePlayInstanceKeys: [],
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

const beforePlay = (instanceKey = "pre:1") => ({
    continuity: "before-play-start" as const,
    instanceKey,
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

const classicResult = {
    status: "complete" as const,
    expectedTimeReached: true,
    overage: false,
    winnerTeam: RED_TEAM,
    loserTeam: BLUE_TEAM,
    finalScore: {
        [Team.RED]: 7,
        [Team.BLUE]: 0,
    },
    reason: "regulation-ended" as const,
    elapsedSeconds: 420,
};

const moveActions = (actions: readonly RoomManagementAction[]) =>
    actions.filter((action) => action.type === "move-player");

describe("planRoomManagement", () => {
    it("adds every available player to Training even when Training is already running", () => {
        const decision = planRoomManagement(
            createSnapshot({
                visibleActionDelayMs: 0,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2),
                    createPlayer(3),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.TRAINING,
                    activeMode: GAME_MODE.TRAINING,
                    running: true,
                }),
            }),
            createState(),
        );

        expect(decision.state.activeRoster?.players).toEqual([
            { playerId: 1, team: Team.RED, order: 0 },
            { playerId: 2, team: Team.BLUE, order: 1 },
            { playerId: 3, team: Team.RED, order: 2 },
        ]);
        expect(moveActions(decision.actions)).toEqual([
            {
                type: "move-player",
                playerId: 2,
                team: Team.BLUE,
                reason: "mode-roster",
            },
            {
                type: "move-player",
                playerId: 3,
                team: Team.RED,
                reason: "mode-roster",
            },
        ]);
    });

    it("switches from Training to Flag by building a fresh 2v2 roster", () => {
        const scheduled = planRoomManagement(
            createSnapshot({
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2, { team: Team.RED }),
                    createPlayer(3, { team: Team.BLUE }),
                    createPlayer(4, { team: Team.BLUE }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.TRAINING,
                    activeMode: GAME_MODE.TRAINING,
                    running: true,
                }),
            }),
            createState(),
        );
        const due = planRoomManagement(
            createSnapshot({
                nowMs: 1_000,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2, { team: Team.RED }),
                    createPlayer(3, { team: Team.BLUE }),
                    createPlayer(4, { team: Team.BLUE }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.TRAINING,
                    activeMode: GAME_MODE.TRAINING,
                    running: true,
                    inspection: beforePlay(),
                }),
            }),
            scheduled.state,
            { allowPendingVisibleActionExecution: true },
        );

        expect(due.actions).toContainEqual({
            type: "stop-game",
            reason: "mode-sync",
        });

        const started = planRoomManagement(
            createSnapshot({
                nowMs: 2_000,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2, { team: Team.RED }),
                    createPlayer(3, { team: Team.BLUE }),
                    createPlayer(4, { team: Team.BLUE }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.TRAINING,
                    activeMode: null,
                    running: false,
                }),
            }),
            due.state,
            { allowPendingVisibleActionExecution: true },
        );

        expect(started.actions).toContainEqual({
            type: "set-mode",
            mode: GAME_MODE.FLAG,
        });
        expect(started.actions).toContainEqual({
            type: "move-player",
            playerId: 2,
            team: Team.BLUE,
            reason: "mode-roster",
        });
        expect(started.actions).toContainEqual({
            type: "move-player",
            playerId: 4,
            team: Team.RED,
            reason: "mode-roster",
        });
        expect(started.state.readiness?.waitingPlayerIds).toEqual([1, 2, 3, 4]);

        const readiness = planRoomManagement(
            createSnapshot({
                nowMs: 2_016,
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
                    inspection: beforePlay("flag:first"),
                }),
            }),
            started.state,
        );

        expect(readiness.actions).toContainEqual({
            type: "pause-game",
            paused: true,
            reason: "readiness",
        });
        expect(readiness.actions).toContainEqual({
            type: "send-message",
            to: "room",
            message: { id: "manager.readiness.waiting" },
        });
    });

    it("expands running Flag 2v2 to 3v3 when two spectators are available", () => {
        const snapshot = createSnapshot({
            visibleActionDelayMs: 0,
            players: [
                createPlayer(1, { team: Team.RED }),
                createPlayer(2, { team: Team.RED }),
                createPlayer(3, { team: Team.BLUE }),
                createPlayer(4, { team: Team.BLUE }),
                createPlayer(5),
                createPlayer(6),
            ],
            game: createGame({
                selectedMode: GAME_MODE.FLAG,
                activeMode: GAME_MODE.FLAG,
                running: true,
                inspection: beforePlay(),
            }),
        });
        const checked = planRoomManagement(snapshot, createState());
        const decision = planRoomManagement(snapshot, checked.state);

        expect(moveActions(decision.actions)).toEqual([
            {
                type: "move-player",
                playerId: 5,
                team: Team.RED,
                reason: "mode-roster",
            },
            {
                type: "move-player",
                playerId: 6,
                team: Team.BLUE,
                reason: "mode-roster",
            },
        ]);
        expect(decision.state.activeRoster?.players).toEqual([
            { playerId: 1, team: Team.RED, order: 0 },
            { playerId: 2, team: Team.RED, order: 1 },
            { playerId: 3, team: Team.BLUE, order: 2 },
            { playerId: 4, team: Team.BLUE, order: 3 },
            { playerId: 5, team: Team.RED, order: 4 },
            { playerId: 6, team: Team.BLUE, order: 5 },
        ]);
    });

    it("creates Classic 4v4 when 10 available players are all spectators", () => {
        const due = planRoomManagement(
            createSnapshot({
                visibleActionDelayMs: 0,
                players: Array.from({ length: 10 }, (_, index) =>
                    createPlayer(index + 1),
                ),
            }),
            createState(),
        );

        expect(due.state.activeRoster?.players).toHaveLength(8);
        expect(
            due.state.activeRoster?.players.filter(
                (player) => player.team === Team.RED,
            ),
        ).toHaveLength(4);
        expect(
            due.state.activeRoster?.players.filter(
                (player) => player.team === Team.BLUE,
            ),
        ).toHaveLength(4);
    });

    it("preserves external Classic 5v5 without making it owned", () => {
        const players = Array.from({ length: 10 }, (_, index) =>
            createPlayer(index + 1, {
                team: index < 5 ? Team.RED : Team.BLUE,
            }),
        );
        const decision = planRoomManagement(
            createSnapshot({
                players,
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    inspection: beforePlay(),
                }),
            }),
            {
                ...createState(),
                activeRoster: {
                    mode: "classic",
                    startedAtMs: 0,
                    players: Array.from({ length: 8 }, (_, index) => ({
                        playerId: index + 1,
                        team: index < 4 ? Team.RED : Team.BLUE,
                        order: index,
                    })),
                },
            },
        );

        expect(moveActions(decision.actions)).toEqual([]);
        expect(decision.state.activeRoster).toBeNull();
        expect(decision.trace.reason).toBe("external roster preserved");
    });

    it("preserves external Classic 5v4 after a manual-layout player leaves", () => {
        const decision = planRoomManagement(
            createSnapshot({
                players: [
                    ...Array.from({ length: 5 }, (_, index) =>
                        createPlayer(index + 1, { team: Team.RED }),
                    ),
                    ...Array.from({ length: 4 }, (_, index) =>
                        createPlayer(index + 6, { team: Team.BLUE }),
                    ),
                    createPlayer(10),
                    createPlayer(11),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    inspection: beforePlay(),
                }),
            }),
            createState(),
        );

        expect(moveActions(decision.actions)).toEqual([]);
        expect(decision.trace.reason).toBe("pre-play afk check passed");
    });

    it("repairs a missing player from an owned Classic 4v4 roster", () => {
        const decision = planRoomManagement(
            createSnapshot({
                players: [
                    ...Array.from({ length: 4 }, (_, index) =>
                        createPlayer(index + 1, { team: Team.RED }),
                    ),
                    ...Array.from({ length: 3 }, (_, index) =>
                        createPlayer(index + 5, { team: Team.BLUE }),
                    ),
                    createPlayer(9),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    inspection: beforePlay(),
                }),
            }),
            {
                ...createState(),
                activeRoster: {
                    mode: "classic",
                    startedAtMs: 0,
                    players: [
                        ...Array.from({ length: 4 }, (_, index) => ({
                            playerId: index + 1,
                            team: RED_TEAM,
                            order: index,
                        })),
                        ...Array.from({ length: 4 }, (_, index) => ({
                            playerId: index + 5,
                            team: BLUE_TEAM,
                            order: index + 4,
                        })),
                    ],
                },
                shortage: {
                    missingPlayerId: 8,
                    missingPlayerName: "Player 8",
                    previousTeam: Team.BLUE,
                    replacementPlayerId: null,
                    replacementAtMs: 0,
                    originalReturnExpiresAtMs: 30_000,
                },
            },
        );

        expect(decision.actions).toContainEqual({
            type: "move-player",
            playerId: 9,
            team: Team.BLUE,
            reason: "shortage",
        });
    });

    it("normalizes overfull Classic completed-game rotation to 4v4", () => {
        const decision = planRoomManagement(
            createSnapshot({
                visibleActionDelayMs: 0,
                players: [
                    ...Array.from({ length: 6 }, (_, index) =>
                        createPlayer(index + 1, { team: Team.RED }),
                    ),
                    ...Array.from({ length: 6 }, (_, index) =>
                        createPlayer(index + 7, { team: Team.BLUE }),
                    ),
                    createPlayer(13),
                    createPlayer(14),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: null,
                    running: false,
                    result: classicResult,
                }),
            }),
            createState(),
        );

        expect(decision.state.activeRoster?.players).toEqual([
            { playerId: 1, team: Team.RED, order: 0 },
            { playerId: 2, team: Team.RED, order: 1 },
            { playerId: 3, team: Team.RED, order: 2 },
            { playerId: 4, team: Team.RED, order: 3 },
            { playerId: 5, team: Team.BLUE, order: 4 },
            { playerId: 6, team: Team.BLUE, order: 5 },
            { playerId: 13, team: Team.BLUE, order: 6 },
            { playerId: 14, team: Team.BLUE, order: 7 },
        ]);
    });

    it("first-play readiness pauses and marks inactive players after ten seconds", () => {
        const state: RoomManagerState = {
            ...createState(),
            readiness: {
                matchStartedAtMs: 0,
                waitingPlayerIds: [1],
                warningSentPlayerIds: [],
            },
        };
        const waiting = planRoomManagement(
            createSnapshot({
                nowMs: 0,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2, { team: Team.BLUE }),
                    createPlayer(3, { team: Team.RED }),
                    createPlayer(4, { team: Team.BLUE }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: GAME_MODE.FLAG,
                    running: true,
                    inspection: beforePlay(),
                }),
            }),
            state,
        );

        expect(waiting.actions).toContainEqual({
            type: "pause-game",
            paused: true,
            reason: "readiness",
        });
        expect(waiting.actions).toContainEqual({
            type: "set-avatar",
            playerId: 1,
            avatar: "❌",
        });
        expect(waiting.actions).not.toContainEqual({
            type: "move-player",
            playerId: 1,
            team: Team.SPECTATORS,
            reason: "afk",
        });

        const expired = planRoomManagement(
            createSnapshot({
                nowMs: 10_000,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2, { team: Team.BLUE }),
                    createPlayer(3, { team: Team.RED }),
                    createPlayer(4, { team: Team.BLUE }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: GAME_MODE.FLAG,
                    running: true,
                    inspection: beforePlay(),
                }),
            }),
            waiting.state,
        );

        expect(expired.actions).toContainEqual({
            type: "move-player",
            playerId: 1,
            team: Team.SPECTATORS,
            reason: "afk",
        });
        expect(expired.actions).toContainEqual({
            type: "send-message",
            to: "room",
            message: {
                id: "manager.readiness.public-marked",
                players: [createPlayer(1, { team: Team.RED })],
            },
        });
        expect(expired.actions).toContainEqual({
            type: "send-message",
            to: "room",
            message: { id: "manager.readiness.pause-ended" },
        });
        expect(expired.actions).toContainEqual({
            type: "set-avatar",
            playerId: 1,
            avatar: null,
        });
        expect(expired.state.autoAfkPlayerIds).toEqual([1]);
    });

    it("starts first-play readiness even when players had activity before the readiness warning", () => {
        const state: RoomManagerState = {
            ...createState(),
            readiness: {
                matchStartedAtMs: 2_000,
                waitingPlayerIds: [1],
                warningSentPlayerIds: [],
            },
            lastActivity: [{ playerId: 1, atMs: 2_500 }],
        };
        const decision = planRoomManagement(
            createSnapshot({
                nowMs: 2_500,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2, { team: Team.BLUE }),
                    createPlayer(3, { team: Team.RED }),
                    createPlayer(4, { team: Team.BLUE }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: GAME_MODE.FLAG,
                    running: true,
                    inspection: beforePlay(),
                }),
            }),
            state,
        );

        expect(decision.actions).toContainEqual({
            type: "pause-game",
            paused: true,
            reason: "readiness",
        });
        expect(decision.actions).toContainEqual({
            type: "send-message",
            to: "room",
            message: { id: "manager.readiness.waiting" },
        });
        expect(decision.actions).toContainEqual({
            type: "set-avatar",
            playerId: 1,
            avatar: "❌",
        });
    });

    it("starts first-play readiness from Flag game start", () => {
        const players = [
            createPlayer(1, { team: Team.RED }),
            createPlayer(2, { team: Team.BLUE }),
            createPlayer(3, { team: Team.RED }),
            createPlayer(4, { team: Team.BLUE }),
        ];
        const startedState = recordGameStart(
            createSnapshot({
                nowMs: 2_000,
                players,
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: GAME_MODE.FLAG,
                    running: true,
                    inspection: null,
                }),
            }),
            {
                ...createState(),
                lastActivity: [
                    { playerId: 1, atMs: 1_000 },
                    { playerId: 2, atMs: 1_000 },
                    { playerId: 3, atMs: 1_000 },
                    { playerId: 4, atMs: 1_000 },
                ],
            },
        );

        expect(startedState.readiness).toEqual({
            matchStartedAtMs: 2_000,
            waitingPlayerIds: [1, 2, 3, 4],
            warningSentPlayerIds: [],
        });

        const decision = planRoomManagement(
            createSnapshot({
                nowMs: 2_016,
                players,
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: GAME_MODE.FLAG,
                    running: true,
                    inspection: beforePlay("flag:first"),
                }),
            }),
            startedState,
        );

        expect(decision.actions).toContainEqual({
            type: "pause-game",
            paused: true,
            reason: "readiness",
        });
        expect(decision.actions).toContainEqual({
            type: "send-message",
            to: "room",
            message: { id: "manager.readiness.waiting" },
        });
    });

    it("does not start first-play readiness from Training game start", () => {
        const startedState = recordGameStart(
            createSnapshot({
                nowMs: 2_000,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2, { team: Team.BLUE }),
                    createPlayer(3, { team: Team.RED }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.TRAINING,
                    activeMode: GAME_MODE.TRAINING,
                    running: true,
                    inspection: null,
                }),
            }),
            createState(),
        );

        expect(startedState.readiness).toBeNull();
    });

    it("does not run normal AFK detection after readiness completes on the same pre-play", () => {
        const players = [
            createPlayer(1, { team: Team.RED }),
            createPlayer(2, { team: Team.BLUE }),
            createPlayer(3, { team: Team.RED }),
            createPlayer(4, { team: Team.BLUE }),
        ];
        const decision = planRoomManagement(
            createSnapshot({
                nowMs: 3_000,
                players,
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: GAME_MODE.FLAG,
                    running: true,
                    paused: true,
                    inspection: beforePlay("flag:first"),
                }),
            }),
            {
                ...createState(),
                readiness: {
                    matchStartedAtMs: 2_000,
                    waitingPlayerIds: [1],
                    warningSentPlayerIds: [1],
                },
                activeRoster: {
                    mode: "flag",
                    startedAtMs: 2_000,
                    players: [
                        { playerId: 1, team: Team.RED, order: 0 },
                        { playerId: 2, team: Team.BLUE, order: 1 },
                        { playerId: 3, team: Team.RED, order: 2 },
                        { playerId: 4, team: Team.BLUE, order: 3 },
                    ],
                },
                lastActivity: [{ playerId: 1, atMs: 3_000 }],
            },
        );

        expect(decision.trace.reason).toBe("readiness complete");
        expect(decision.state.checkedPrePlayInstanceKeys).toEqual([
            "flag:first",
        ]);
        expect(decision.actions).not.toContainEqual({
            type: "pause-game",
            paused: true,
            reason: "afk-warning",
        });
    });

    it("allows normal AFK detection on a later pre-play after readiness completes", () => {
        const players = [
            createPlayer(1, { team: Team.RED }),
            createPlayer(2, { team: Team.BLUE }),
            createPlayer(3, { team: Team.RED }),
            createPlayer(4, { team: Team.BLUE }),
        ];
        const ready = planRoomManagement(
            createSnapshot({
                nowMs: 3_000,
                players,
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: GAME_MODE.FLAG,
                    running: true,
                    paused: true,
                    inspection: beforePlay("flag:first"),
                }),
            }),
            {
                ...createState(),
                readiness: {
                    matchStartedAtMs: 2_000,
                    waitingPlayerIds: [1],
                    warningSentPlayerIds: [1],
                },
                activeRoster: {
                    mode: "flag",
                    startedAtMs: 2_000,
                    players: [
                        { playerId: 1, team: Team.RED, order: 0 },
                        { playerId: 2, team: Team.BLUE, order: 1 },
                        { playerId: 3, team: Team.RED, order: 2 },
                        { playerId: 4, team: Team.BLUE, order: 3 },
                    ],
                },
                lastActivity: [{ playerId: 1, atMs: 3_000 }],
            },
        );
        const laterPrePlay = planRoomManagement(
            createSnapshot({
                nowMs: 9_000,
                players,
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: GAME_MODE.FLAG,
                    running: true,
                    inspection: beforePlay("flag:second"),
                }),
            }),
            ready.state,
        );

        expect(laterPrePlay.trace.reason).toBe("pre-play afk pause started");
        expect(laterPrePlay.actions).toContainEqual({
            type: "pause-game",
            paused: true,
            reason: "afk-warning",
        });
        expect(laterPrePlay.state.checkedPrePlayInstanceKeys).toEqual([
            "flag:second",
        ]);
    });

    it("clears checked pre-play keys when a new game starts", () => {
        const startedState = recordGameStart(
            createSnapshot({
                nowMs: 1_000,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2, { team: Team.BLUE }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                }),
            }),
            {
                ...createState(),
                checkedPrePlayInstanceKeys: ["PRESNAP:1"],
            },
        );

        expect(startedState.checkedPrePlayInstanceKeys).toEqual([]);
    });

    it("shows confirmed readiness avatars and clears them when the game stops", () => {
        const state: RoomManagerState = {
            ...createState(),
            readiness: {
                matchStartedAtMs: 0,
                waitingPlayerIds: [1, 2],
                warningSentPlayerIds: [1, 2],
            },
        };
        const activeState = recordPlayerActivity(state, 2, 1_000);
        const waiting = planRoomManagement(
            createSnapshot({
                nowMs: 2_000,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2, { team: Team.BLUE }),
                    createPlayer(3, { team: Team.RED }),
                    createPlayer(4, { team: Team.BLUE }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: GAME_MODE.FLAG,
                    running: true,
                    inspection: beforePlay(),
                }),
            }),
            activeState,
        );

        expect(waiting.actions).toContainEqual({
            type: "set-avatar",
            playerId: 1,
            avatar: "❌",
        });
        expect(waiting.actions).toContainEqual({
            type: "set-avatar",
            playerId: 2,
            avatar: "✅",
        });

        const stopped = planRoomManagement(
            createSnapshot({
                nowMs: 3_000,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2, { team: Team.BLUE }),
                    createPlayer(3, { team: Team.RED }),
                    createPlayer(4, { team: Team.BLUE }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: GAME_MODE.FLAG,
                    running: false,
                    inspection: null,
                }),
            }),
            waiting.state,
        );

        expect(stopped.actions).toContainEqual({
            type: "set-avatar",
            playerId: 1,
            avatar: null,
        });
        expect(stopped.actions).toContainEqual({
            type: "set-avatar",
            playerId: 2,
            avatar: null,
        });
        expect(stopped.state.readiness).toBeNull();
    });

    it("normal AFK check runs once per pre-play key and expires after ten seconds", () => {
        const started = planRoomManagement(
            createSnapshot({
                nowMs: 6_000,
                players: [createPlayer(1, { team: Team.RED })],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    inspection: beforePlay("pre:afk"),
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

        expect(started.actions).toContainEqual({
            type: "pause-game",
            paused: true,
            reason: "afk-warning",
        });
        expect(started.state.afkCheck?.instanceKey).toBe("pre:afk");

        const repeated = planRoomManagement(
            createSnapshot({
                nowMs: 7_000,
                players: [createPlayer(1, { team: Team.RED })],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    paused: true,
                    inspection: beforePlay("pre:afk"),
                }),
            }),
            started.state,
        );

        expect(moveActions(repeated.actions)).toEqual([]);
        expect(repeated.trace.reason).toBe("afk pause waiting");

        const cleared = planRoomManagement(
            createSnapshot({
                nowMs: 7_500,
                players: [createPlayer(1, { team: Team.RED })],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    paused: true,
                    inspection: beforePlay("pre:afk"),
                }),
            }),
            recordPlayerActivity(repeated.state, 1, 7_500),
        );

        expect(cleared.actions).toContainEqual({
            type: "send-message",
            to: "room",
            message: { id: "manager.afk.pause-ended" },
        });

        const expired = planRoomManagement(
            createSnapshot({
                nowMs: 16_000,
                players: [createPlayer(1, { team: Team.RED })],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    paused: true,
                    inspection: beforePlay("pre:afk"),
                }),
            }),
            repeated.state,
        );

        expect(expired.actions).toContainEqual({
            type: "move-player",
            playerId: 1,
            team: Team.SPECTATORS,
            reason: "afk",
        });
        expect(expired.actions).toContainEqual({
            type: "send-message",
            to: "room",
            message: {
                id: "manager.afk.public-marked",
                players: [createPlayer(1, { team: Team.RED })],
            },
        });
        expect(expired.actions).toContainEqual({
            type: "send-message",
            to: "room",
            message: { id: "manager.afk.pause-ended" },
        });
    });

    it("does not count stale Training inactivity against the first Flag pre-play check", () => {
        const decision = planRoomManagement(
            createSnapshot({
                nowMs: 9_000,
                players: [createPlayer(1, { team: Team.RED })],
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: GAME_MODE.FLAG,
                    running: true,
                    inspection: beforePlay("pre:fresh-flag"),
                }),
            }),
            {
                ...createState(),
                activeRoster: {
                    mode: "flag",
                    startedAtMs: 5_000,
                    players: [{ playerId: 1, team: Team.RED, order: 0 }],
                },
                lastActivity: [{ playerId: 1, atMs: 0 }],
            },
        );

        expect(decision.trace.reason).toBe("pre-play afk check passed");
        expect(decision.actions).not.toContainEqual({
            type: "pause-game",
            paused: true,
            reason: "afk-warning",
        });
    });

    it("sends a single public AFK warning for all inactive players", () => {
        const player1 = createPlayer(1, { team: Team.RED });
        const player2 = createPlayer(2, { team: Team.BLUE });
        const decision = planRoomManagement(
            createSnapshot({
                nowMs: 6_000,
                players: [player1, player2],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    inspection: beforePlay("pre:multiple-afk"),
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
                lastActivity: [
                    { playerId: 1, atMs: 0 },
                    { playerId: 2, atMs: 0 },
                ],
            },
        );
        const publicWarnings = decision.actions.filter(
            (action) =>
                action.type === "send-message" &&
                action.to === "room" &&
                action.message.id === "manager.afk.public-warning",
        );

        expect(publicWarnings).toEqual([
            {
                type: "send-message",
                to: "room",
                message: {
                    id: "manager.afk.public-warning",
                    players: [player1, player2],
                },
            },
        ]);
    });

    it("does not detect new AFK players during an AFK pause", () => {
        const decision = planRoomManagement(
            createSnapshot({
                nowMs: 7_000,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2, { team: Team.BLUE }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    paused: true,
                    inspection: beforePlay("pre:afk"),
                }),
            }),
            {
                ...createState(),
                afkCheck: {
                    instanceKey: "pre:afk",
                    kind: "normal",
                    playerIds: [1],
                    startedAtMs: 6_000,
                    warningSentPlayerIds: [1],
                },
                afkWarningPlayerIds: [1],
                afkPausedPlayerIds: [1],
                afkPauseStartedAtMs: 6_000,
                lastActivity: [
                    { playerId: 1, atMs: 0 },
                    { playerId: 2, atMs: 0 },
                ],
            },
        );

        expect(decision.state.afkWarningPlayerIds).toEqual([1]);
        expect(decision.actions).not.toContainEqual({
            type: "send-message",
            to: 2,
            message: { id: "manager.afk.warning" },
        });
    });

    it("does not emit readiness blocker actions", () => {
        const decision = planRoomManagement(
            createSnapshot({
                nowMs: 1_000,
                players: [createPlayer(1, { team: Team.RED })],
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: GAME_MODE.FLAG,
                    running: true,
                    inspection: beforePlay(),
                }),
            }),
            {
                ...createState(),
                readiness: {
                    matchStartedAtMs: 0,
                    waitingPlayerIds: [1],
                    warningSentPlayerIds: [],
                },
            },
        );

        expect(
            decision.actions
                .map((action): string => action.type)
                .includes("set-readiness-blocker"),
        ).toBe(false);
    });

    it("clears warning and auto-afk when the player becomes active again", () => {
        const decision = planRoomManagement(
            createSnapshot({
                nowMs: 21_000,
                players: [createPlayer(1, { team: Team.RED })],
                game: createGame({
                    selectedMode: GAME_MODE.CLASSIC,
                    activeMode: GAME_MODE.CLASSIC,
                    running: true,
                    inspection: { continuity: "play-started" },
                }),
            }),
            recordPlayerActivity(
                {
                    ...createState(),
                    autoAfkPlayerIds: [1],
                    afkWarningPlayerIds: [1],
                    lastActivity: [{ playerId: 1, atMs: 0 }],
                },
                1,
                21_000,
            ),
        );

        expect(decision.state.autoAfkPlayerIds).toEqual([]);
        expect(decision.state.afkWarningPlayerIds).toEqual([]);
    });

    it("removes field players that become AFK from the active layout", () => {
        const decision = planRoomManagement(
            createSnapshot({
                visibleActionDelayMs: 0,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2, { team: Team.BLUE }),
                    createPlayer(3, { team: Team.RED }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.TRAINING,
                    activeMode: GAME_MODE.TRAINING,
                    running: true,
                }),
            }),
            {
                ...createState(),
                manualAfkPlayerIds: [2],
            },
        );

        expect(moveActions(decision.actions)).toContainEqual({
            type: "move-player",
            playerId: 2,
            team: Team.SPECTATORS,
            reason: "mode-roster",
        });
    });

    it("replaces an active Flag player who becomes AFK with a waiting spectator", () => {
        const decision = planRoomManagement(
            createSnapshot({
                visibleActionDelayMs: 0,
                players: [
                    createPlayer(1),
                    createPlayer(2, { team: Team.BLUE }),
                    createPlayer(3, { team: Team.RED }),
                    createPlayer(4, { team: Team.BLUE }),
                    createPlayer(5),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.FLAG,
                    activeMode: GAME_MODE.FLAG,
                    running: true,
                    inspection: beforePlay(),
                }),
            }),
            {
                ...createState(),
                autoAfkPlayerIds: [1],
                activeRoster: {
                    mode: "flag",
                    startedAtMs: 0,
                    players: [
                        { playerId: 1, team: Team.RED, order: 0 },
                        { playerId: 2, team: Team.BLUE, order: 1 },
                        { playerId: 3, team: Team.RED, order: 2 },
                        { playerId: 4, team: Team.BLUE, order: 3 },
                    ],
                },
            },
        );

        expect(moveActions(decision.actions)).toContainEqual({
            type: "move-player",
            playerId: 5,
            team: Team.RED,
            reason: "mode-roster",
        });
        expect(decision.state.activeRoster?.players).toEqual([
            { playerId: 5, team: Team.RED, order: 0 },
            { playerId: 2, team: Team.BLUE, order: 1 },
            { playerId: 3, team: Team.RED, order: 2 },
            { playerId: 4, team: Team.BLUE, order: 3 },
        ]);
    });

    it("adds players back to Training when they leave AFK", () => {
        const decision = planRoomManagement(
            createSnapshot({
                visibleActionDelayMs: 0,
                players: [
                    createPlayer(1, { team: Team.RED }),
                    createPlayer(2),
                    createPlayer(3, { team: Team.RED }),
                ],
                game: createGame({
                    selectedMode: GAME_MODE.TRAINING,
                    activeMode: GAME_MODE.TRAINING,
                    running: true,
                }),
            }),
            createState(),
        );

        expect(moveActions(decision.actions)).toContainEqual({
            type: "move-player",
            playerId: 2,
            team: Team.RED,
            reason: "mode-roster",
        });
    });
});
