import { Team, isFieldTeam } from "@runtime/models";
import {
    deriveManagerContext,
    getCompletedResultKey,
    isBeforePlayStart,
    needsModeSync,
    type ManagerContext,
} from "./facts";
import { ROOM_MANAGER_DEFAULT_VISIBLE_ACTION_DELAY_MS } from "./types";
import type {
    DesiredRoomMode,
    RoomManagementAction,
    RoomManagementDecision,
    RoomManagementMessage,
    RoomManagementPlanningOptions,
    RoomManagementPlayer,
    RoomManagementSnapshot,
    RoomManagerState,
} from "./types";

const AFK_PRE_PLAY_INACTIVE_MS = 5_000;
const AFK_PRE_PLAY_GRACE_MS = 5_000;
const FIRST_PLAY_READINESS_GRACE_MS = 10_000;

type MainRule = {
    name: string;
    when(ctx: ManagerContext): boolean;
    plan(
        ctx: ManagerContext,
        options?: RoomManagementPlanningOptions,
    ): RulePlan;
};

type RulePlan = {
    actions: readonly RoomManagementAction[];
    state: RoomManagerState;
    reason: string;
};

const MODE_MESSAGES = {
    idle: "manager.mode.idle",
    training: "manager.mode.training",
    flag: "manager.mode.flag",
    classic: "manager.mode.classic",
} satisfies Record<DesiredRoomMode, RoomManagementMessage["id"]>;

function schedulePendingVisibleAction(
    ctx: ManagerContext,
    reason: string,
): RoomManagerState {
    return {
        ...ctx.state,
        pendingVisibleAction: {
            kind: "mode-sync",
            stage: "waiting",
            desiredMode: ctx.desiredMode,
            executeAtMs:
                ctx.snapshot.nowMs + ctx.snapshot.config.visibleActionDelayMs,
            snapshotKey: ctx.modeSyncSnapshotKey,
            reason,
        },
    };
}

function requiresRunningGameRestart(ctx: ManagerContext): boolean {
    if (ctx.desiredMode === "idle") return false;
    if (!ctx.snapshot.game.running) return false;

    return (
        ctx.snapshot.game.activeMode !== ctx.desiredGameMode ||
        ctx.snapshot.game.selectedMode !== ctx.desiredGameMode
    );
}

function getPlayersByIds(
    players: readonly RoomManagementPlayer[],
    playerIds: readonly number[],
): readonly RoomManagementPlayer[] {
    const playerIdSet = new Set(playerIds);

    return players.filter((player) => playerIdSet.has(player.id));
}

function scheduleModeSyncAfterStop(
    ctx: ManagerContext,
    reason: string,
): RoomManagerState {
    return {
        ...ctx.state,
        pendingVisibleAction: {
            kind: "mode-sync",
            stage: "after-stop",
            desiredMode: ctx.desiredMode,
            executeAtMs:
                ctx.snapshot.nowMs +
                Math.max(
                    ctx.snapshot.config.visibleActionDelayMs,
                    ROOM_MANAGER_DEFAULT_VISIBLE_ACTION_DELAY_MS,
                ),
            snapshotKey: ctx.modeSyncSnapshotKey,
            reason,
        },
        readiness: null,
    };
}

function getStopForModeRestartActions(): readonly RoomManagementAction[] {
    return [
        { type: "set-pre-play-timeout-hold", held: false },
        {
            type: "stop-game",
            reason: "mode-sync",
        },
    ];
}

function getModeSyncActions(
    ctx: ManagerContext,
): readonly RoomManagementAction[] {
    const baseActions: readonly RoomManagementAction[] = [
        { type: "set-pre-play-timeout-hold", held: false },
    ];

    const desiredRosterIds = new Set(
        ctx.desiredRoster.map((player) => player.playerId),
    );
    const restartRequired =
        ctx.desiredMode !== "idle" &&
        (!ctx.snapshot.game.running ||
            ctx.snapshot.game.activeMode !== ctx.desiredGameMode ||
            ctx.snapshot.game.selectedMode !== ctx.desiredGameMode);
    const stopCurrentGameActions: readonly RoomManagementAction[] =
        ctx.snapshot.game.running && restartRequired
            ? [
                  {
                      type: "stop-game",
                      reason: "mode-sync",
                  },
              ]
            : [];

    if (ctx.desiredMode === "idle") {
        const stopGameActions: readonly RoomManagementAction[] = ctx.snapshot
            .game.running
            ? [
                  {
                      type: "stop-game",
                      reason: "idle",
                  },
              ]
            : [];
        const spectatorMoveActions = ctx.fieldPlayers.map<RoomManagementAction>(
            (player) => ({
                type: "move-player",
                playerId: player.id,
                team: Team.SPECTATORS,
                reason: "idle",
            }),
        );

        return [
            ...baseActions,
            ...stopGameActions,
            ...spectatorMoveActions,
            {
                type: "send-message",
                to: "room",
                message: { id: MODE_MESSAGES.idle },
            },
            {
                type: "emit-event",
                event: "manager-action",
                payload: {
                    action: "mode-sync",
                    mode: "idle",
                    availablePlayers: ctx.availablePlayers.length,
                },
            },
        ];
    }

    const setModeActions: readonly RoomManagementAction[] =
        ctx.desiredGameMode &&
        ctx.snapshot.game.selectedMode !== ctx.desiredGameMode
            ? [{ type: "set-mode", mode: ctx.desiredGameMode }]
            : [];
    const rosterMoveActions = ctx.desiredRoster.flatMap<RoomManagementAction>(
        (rosterPlayer) => {
            const player = ctx.snapshot.players.find(
                (candidate) => candidate.id === rosterPlayer.playerId,
            );

            if (!player || player.team === rosterPlayer.team) return [];

            return [
                {
                    type: "move-player",
                    playerId: rosterPlayer.playerId,
                    team: rosterPlayer.team,
                    reason: "mode-roster",
                },
            ];
        },
    );
    const extraFieldMoveActions = ctx.snapshot.players
        .filter((player) => isFieldTeam(player.team))
        .filter((player) => !desiredRosterIds.has(player.id))
        .map<RoomManagementAction>((player) => ({
            type: "move-player",
            playerId: player.id,
            team: Team.SPECTATORS,
            reason: "mode-roster",
        }));
    const startGameActions: readonly RoomManagementAction[] = restartRequired
        ? [{ type: "start-game" }]
        : [];
    const modeMessageActions: readonly RoomManagementAction[] = restartRequired
        ? [
              {
                  type: "send-message",
                  to: "room",
                  message: { id: MODE_MESSAGES[ctx.desiredMode] },
              },
          ]
        : [];

    return [
        ...baseActions,
        ...stopCurrentGameActions,
        ...setModeActions,
        ...rosterMoveActions,
        ...extraFieldMoveActions,
        ...startGameActions,
        ...modeMessageActions,
        {
            type: "emit-event",
            event: "manager-action",
            payload: {
                action: "mode-sync",
                mode: ctx.desiredMode,
                availablePlayers: ctx.availablePlayers.length,
            },
        },
    ];
}

function getStateAfterModeSync(ctx: ManagerContext): RoomManagerState {
    return {
        ...ctx.state,
        activeRoster:
            ctx.desiredMode === "idle"
                ? null
                : {
                      mode: ctx.desiredMode,
                      players: ctx.desiredRoster,
                      startedAtMs: ctx.snapshot.nowMs,
                  },
        lastCompletedResultKey:
            getCompletedResultKey(ctx.snapshot.game.result) ??
            ctx.state.lastCompletedResultKey,
        readiness:
            ctx.snapshot.config.afkActivityDetectionEnabled &&
            (ctx.desiredMode === "flag" || ctx.desiredMode === "classic")
                ? {
                      matchStartedAtMs: ctx.snapshot.nowMs,
                      waitingPlayerIds: ctx.desiredRoster.map(
                          (player) => player.playerId,
                      ),
                      warningSentPlayerIds: [],
                  }
                : null,
        pendingVisibleAction: null,
    };
}

function getInvariantActions(
    ctx: ManagerContext,
): readonly RoomManagementAction[] {
    const lockActions: readonly RoomManagementAction[] = ctx.snapshot
        .teamsLocked
        ? []
        : [{ type: "lock-teams" }];
    const ineligiblePlayerActions =
        ctx.ineligibleFieldPlayers.flatMap<RoomManagementAction>((player) => [
            {
                type: "move-player",
                playerId: player.id,
                team: Team.SPECTATORS,
                reason: "ineligible",
            },
            {
                type: "send-message",
                to: player.id,
                message: { id: "manager.eligibility.register" },
            },
        ]);

    return [...lockActions, ...ineligiblePlayerActions];
}

function getLastActivityAt(
    state: RoomManagerState,
    playerId: number,
): number | null {
    const activity = state.lastActivity.find(
        (entry) => entry.playerId === playerId,
    );

    return activity?.atMs ?? null;
}

function getPlayerInactiveMs(ctx: ManagerContext, playerId: number): number {
    const lastActivityAt =
        getLastActivityAt(ctx.state, playerId) ??
        ctx.state.activeRoster?.startedAtMs ??
        ctx.snapshot.nowMs;

    return ctx.snapshot.nowMs - lastActivityAt;
}

function clearAfkPauseState(
    state: RoomManagerState,
    nowMs: number,
): RoomManagerState {
    return {
        ...state,
        afkCheck: null,
        afkPausedPlayerIds: [],
        afkPauseStartedAtMs: null,
        afkPauseBaseline: [],
        afkReminderAt: [],
        lastActivity: state.lastActivity.map((activity) => ({
            ...activity,
            atMs: Math.max(activity.atMs, nowMs),
        })),
    };
}

function getPrePlayInstanceKey(ctx: ManagerContext): string | null {
    if (!isBeforePlayStart(ctx.snapshot)) return null;

    return ctx.snapshot.game.inspection?.instanceKey ?? null;
}

function addCheckedPrePlayInstanceKey(
    state: RoomManagerState,
    instanceKey: string,
): readonly string[] {
    return Array.from(
        new Set([...state.checkedPrePlayInstanceKeys, instanceKey]),
    );
}

function resetActivityForPlayers(
    state: RoomManagerState,
    playerIds: readonly number[],
    nowMs: number,
): RoomManagerState {
    const playerIdSet = new Set(playerIds);

    return {
        ...state,
        lastActivity: [
            ...state.lastActivity.filter(
                (activity) => !playerIdSet.has(activity.playerId),
            ),
            ...playerIds.map((playerId) => ({ playerId, atMs: nowMs })),
        ],
    };
}

function rostersMatch(
    left: readonly { playerId: number; team: TeamID }[],
    right: readonly { playerId: number; team: TeamID }[],
): boolean {
    if (left.length !== right.length) return false;

    const rightTeamsByPlayerId = new Map(
        right.map((player) => [player.playerId, player.team]),
    );

    return left.every(
        (player) => rightTeamsByPlayerId.get(player.playerId) === player.team,
    );
}

const disabledRule: MainRule = {
    name: "disabledRule",
    when: (ctx) =>
        !ctx.snapshot.config.enabled || ctx.state.status === "disabled",
    plan: (ctx) => ({
        actions: [{ type: "set-pre-play-timeout-hold", held: false }],
        state: {
            ...ctx.state,
            pendingVisibleAction: null,
            readiness: null,
            afkCheck: null,
        },
        reason: "manager disabled",
    }),
};

const suspendedRule: MainRule = {
    name: "suspendedRule",
    when: (ctx) => ctx.state.status === "suspended",
    plan: (ctx) => ({
        actions: [{ type: "set-pre-play-timeout-hold", held: false }],
        state: ctx.state,
        reason: "manager suspended",
    }),
};

const shortageRule: MainRule = {
    name: "shortageRule",
    when: (ctx) => ctx.state.shortage !== null,
    plan: (ctx) => {
        const shortage = ctx.state.shortage;
        if (!shortage) {
            return {
                actions: [],
                state: ctx.state,
                reason: "shortage unavailable",
            };
        }

        const missingPlayer = ctx.snapshot.players.find(
            (player) => player.id === shortage.missingPlayerId,
        );
        const replacementPlayer = shortage.replacementPlayerId
            ? ctx.snapshot.players.find(
                  (player) => player.id === shortage.replacementPlayerId,
              )
            : null;

        if (
            shortage.replacementPlayerId &&
            ctx.snapshot.nowMs > shortage.originalReturnExpiresAtMs
        ) {
            return {
                actions: [],
                state: {
                    ...ctx.state,
                    shortage: null,
                },
                reason: "shortage return window expired",
            };
        }

        if (shortage.replacementPlayerId && !replacementPlayer) {
            return {
                actions: [],
                state: {
                    ...ctx.state,
                    shortage: {
                        ...shortage,
                        replacementPlayerId: null,
                    },
                },
                reason: "shortage replacement left",
            };
        }

        if (shortage.replacementPlayerId && replacementPlayer) {
            if (!missingPlayer) {
                return {
                    actions: [],
                    state: ctx.state,
                    reason:
                        replacementPlayer.team === shortage.previousTeam
                            ? "shortage replacement active"
                            : "waiting for shortage replacement move",
                };
            }

            if (!ctx.canApplyVisibleGameChange) {
                return {
                    actions: [],
                    state: ctx.state,
                    reason: "waiting to restore shortage",
                };
            }

            return {
                actions: [
                    {
                        type: "move-player",
                        playerId: missingPlayer.id,
                        team: shortage.previousTeam,
                        reason: "restore-original",
                    },
                    {
                        type: "move-player",
                        playerId: replacementPlayer.id,
                        team: Team.SPECTATORS,
                        reason: "restore-original",
                    },
                ],
                state: {
                    ...ctx.state,
                    shortage: null,
                    activeRoster: ctx.state.activeRoster
                        ? {
                              ...ctx.state.activeRoster,
                              players: ctx.state.activeRoster.players.map(
                                  (rosterPlayer) =>
                                      rosterPlayer.playerId ===
                                      replacementPlayer.id
                                          ? {
                                                ...rosterPlayer,
                                                playerId: missingPlayer.id,
                                            }
                                          : rosterPlayer,
                              ),
                          }
                        : null,
                },
                reason: "shortage original restored",
            };
        }

        const replacement = ctx.availablePlayers.find(
            (player) =>
                player.team === Team.SPECTATORS &&
                player.id !== shortage.missingPlayerId,
        );

        if (replacement) {
            const latestCheckpoint =
                ctx.snapshot.game.checkpoints[
                    ctx.snapshot.game.checkpoints.length - 1
                ] ?? null;
            const restoreCheckpointActions: readonly RoomManagementAction[] =
                !ctx.canApplyVisibleGameChange && latestCheckpoint
                    ? [
                          {
                              type: "restore-checkpoint",
                              ...(latestCheckpoint.key
                                  ? { checkpointId: latestCheckpoint.key }
                                  : {}),
                          },
                      ]
                    : [];
            const replacementActions: readonly RoomManagementAction[] = [
                {
                    type: "move-player",
                    playerId: replacement.id,
                    team: shortage.previousTeam,
                    reason: "shortage",
                },
                {
                    type: "send-message",
                    to: "room",
                    message: {
                        id: "manager.shortage.replaced",
                        missingPlayer: {
                            id: shortage.missingPlayerId,
                            name: shortage.missingPlayerName,
                        },
                        replacementPlayer: {
                            id: replacement.id,
                            name: replacement.name,
                        },
                        replacementTeam: shortage.previousTeam,
                    },
                },
                {
                    type: "emit-event",
                    event: "manager-shortage",
                    payload: {
                        missingPlayerId: shortage.missingPlayerId,
                        replacementPlayerId: replacement.id,
                    },
                },
            ];

            return {
                actions: [...restoreCheckpointActions, ...replacementActions],
                state: {
                    ...ctx.state,
                    shortage: {
                        ...shortage,
                        replacementPlayerId: replacement.id,
                        replacementAtMs: ctx.snapshot.nowMs,
                    },
                    activeRoster: ctx.state.activeRoster
                        ? {
                              ...ctx.state.activeRoster,
                              players: ctx.state.activeRoster.players.map(
                                  (rosterPlayer) =>
                                      rosterPlayer.playerId ===
                                      shortage.missingPlayerId
                                          ? {
                                                ...rosterPlayer,
                                                playerId: replacement.id,
                                            }
                                          : rosterPlayer,
                              ),
                          }
                        : null,
                },
                reason: "shortage replacement found",
            };
        }

        return {
            actions: [
                ...getModeSyncActions(ctx),
                {
                    type: "send-message",
                    to: "room",
                    message: {
                        id: "manager.shortage.rebuild",
                        missingPlayer: {
                            id: shortage.missingPlayerId,
                            name: shortage.missingPlayerName,
                        },
                    },
                },
                {
                    type: "emit-event",
                    event: "manager-shortage",
                    payload: {
                        missingPlayerId: shortage.missingPlayerId,
                        replacementPlayerId: null,
                    },
                },
            ],
            state: {
                ...getStateAfterModeSync(ctx),
                shortage: null,
            },
            reason: "shortage rebuild fallback",
        };
    },
};

const readinessRule: MainRule = {
    name: "readinessRule",
    when: (ctx) => ctx.state.readiness !== null,
    plan: (ctx) => {
        const readiness = ctx.state.readiness;
        if (!readiness) {
            return {
                actions: [],
                state: ctx.state,
                reason: "readiness unavailable",
            };
        }

        if (ctx.desiredMode !== "flag" && ctx.desiredMode !== "classic") {
            return {
                actions: [{ type: "set-pre-play-timeout-hold", held: false }],
                state: {
                    ...ctx.state,
                    readiness: null,
                },
                reason: "readiness cleared outside match mode",
            };
        }

        if (!ctx.snapshot.config.afkActivityDetectionEnabled) {
            return {
                actions: [{ type: "set-pre-play-timeout-hold", held: false }],
                state: {
                    ...ctx.state,
                    readiness: null,
                },
                reason: "readiness skipped",
            };
        }

        const waitingPlayerIds = readiness.waitingPlayerIds.filter(
            (playerId) => {
                const lastActivityAt = getLastActivityAt(ctx.state, playerId);
                return (
                    lastActivityAt === null ||
                    lastActivityAt < readiness.matchStartedAtMs
                );
            },
        );

        if (waitingPlayerIds.length === 0) {
            return {
                actions: [
                    {
                        type: "pause-game",
                        paused: false,
                        reason: "readiness-complete",
                    },
                    { type: "set-pre-play-timeout-hold", held: false },
                    {
                        type: "send-message",
                        to: "room",
                        message: { id: "manager.readiness.pause-ended" },
                    },
                    {
                        type: "emit-event",
                        event: "manager-readiness",
                        payload: {
                            status: "complete",
                        },
                    },
                ],
                state: {
                    ...ctx.state,
                    readiness: null,
                },
                reason: "readiness complete",
            };
        }

        const holdActions: readonly RoomManagementAction[] = [
            {
                type: "pause-game",
                paused: true,
                reason: "readiness",
            },
            { type: "set-pre-play-timeout-hold", held: true },
        ];
        const unwarnedPlayerIds = waitingPlayerIds.filter(
            (playerId) => !readiness.warningSentPlayerIds.includes(playerId),
        );
        const warningActions =
            unwarnedPlayerIds.length > 0
                ? [
                      {
                          type: "send-message",
                          to: "room",
                          message: { id: "manager.readiness.waiting" },
                      } satisfies RoomManagementAction,
                  ]
                : [];
        const waitingActions = [...holdActions, ...warningActions];

        if (
            ctx.snapshot.nowMs - readiness.matchStartedAtMs <
            FIRST_PLAY_READINESS_GRACE_MS
        ) {
            return {
                actions: waitingActions,
                state: {
                    ...ctx.state,
                    readiness: {
                        ...readiness,
                        warningSentPlayerIds: Array.from(
                            new Set([
                                ...readiness.warningSentPlayerIds,
                                ...unwarnedPlayerIds,
                            ]),
                        ),
                    },
                },
                reason: "waiting for first activity",
            };
        }

        const inactivePlayerActions =
            waitingPlayerIds.flatMap<RoomManagementAction>((playerId) => [
                {
                    type: "move-player",
                    playerId,
                    team: Team.SPECTATORS,
                    reason: "afk",
                },
                {
                    type: "send-message",
                    to: playerId,
                    message: { id: "manager.afk.marked" },
                },
            ]);
        const inactivePlayers = getPlayersByIds(
            ctx.snapshot.players,
            waitingPlayerIds,
        );

        return {
            actions: [
                {
                    type: "pause-game",
                    paused: false,
                    reason: "readiness-timeout",
                },
                { type: "set-pre-play-timeout-hold", held: false },
                ...inactivePlayerActions,
                {
                    type: "send-message",
                    to: "room",
                    message: {
                        id: "manager.readiness.public-marked",
                        players: inactivePlayers,
                    },
                },
                {
                    type: "send-message",
                    to: "room",
                    message: { id: "manager.readiness.pause-ended" },
                },
                {
                    type: "emit-event",
                    event: "manager-readiness",
                    payload: {
                        status: "inactive-players-moved",
                        playerCount: waitingPlayerIds.length,
                    },
                },
            ],
            state: {
                ...ctx.state,
                autoAfkPlayerIds: Array.from(
                    new Set([
                        ...ctx.state.autoAfkPlayerIds,
                        ...waitingPlayerIds,
                    ]),
                ),
                readiness: null,
                pendingVisibleAction: null,
            },
            reason: "readiness inactive players moved",
        };
    },
};

const afkPrePlayCheckRule: MainRule = {
    name: "afkPrePlayCheckRule",
    when: (ctx) => {
        const instanceKey = getPrePlayInstanceKey(ctx);

        return (
            ctx.snapshot.config.afkActivityDetectionEnabled &&
            ctx.snapshot.game.running &&
            ctx.state.readiness === null &&
            ctx.state.afkCheck === null &&
            instanceKey !== null &&
            !ctx.state.checkedPrePlayInstanceKeys.includes(instanceKey) &&
            (ctx.snapshot.game.activeMode === "flag" ||
                ctx.snapshot.game.activeMode === "classic")
        );
    },
    plan: (ctx) => {
        const instanceKey = getPrePlayInstanceKey(ctx);
        if (!instanceKey) {
            return {
                actions: [],
                state: ctx.state,
                reason: "pre-play unavailable",
            };
        }

        const inactivePlayers = ctx.fieldPlayers.filter(
            (player) =>
                player.playable &&
                !ctx.afkPlayerIds.has(player.id) &&
                getPlayerInactiveMs(ctx, player.id) > AFK_PRE_PLAY_INACTIVE_MS,
        );

        if (inactivePlayers.length === 0) {
            return {
                actions: [],
                state: {
                    ...ctx.state,
                    checkedPrePlayInstanceKeys: addCheckedPrePlayInstanceKey(
                        ctx.state,
                        instanceKey,
                    ),
                },
                reason: "pre-play afk check passed",
            };
        }

        const inactivePlayerIds = inactivePlayers.map((player) => player.id);
        const inactivePlayerIdSet = new Set(inactivePlayerIds);
        const nonAfkFieldPlayerIds = ctx.fieldPlayers
            .filter((player) => !inactivePlayerIdSet.has(player.id))
            .map((player) => player.id);
        const nextState = resetActivityForPlayers(
            ctx.state,
            nonAfkFieldPlayerIds,
            ctx.snapshot.nowMs,
        );

        return {
            actions: [
                {
                    type: "pause-game",
                    paused: true,
                    reason: "afk-warning",
                },
                { type: "set-pre-play-timeout-hold", held: true },
                ...inactivePlayers.map<RoomManagementAction>((player) => ({
                    type: "send-message",
                    to: "room",
                    message: {
                        id: "manager.afk.public-warning",
                        player,
                    },
                })),
                ...inactivePlayers.map<RoomManagementAction>((player) => ({
                    type: "send-message",
                    to: player.id,
                    message: { id: "manager.afk.warning" },
                })),
            ],
            state: {
                ...nextState,
                afkCheck: {
                    instanceKey,
                    kind: "normal",
                    playerIds: inactivePlayerIds,
                    startedAtMs: ctx.snapshot.nowMs,
                    warningSentPlayerIds: inactivePlayerIds,
                },
                checkedPrePlayInstanceKeys: addCheckedPrePlayInstanceKey(
                    nextState,
                    instanceKey,
                ),
                afkWarningPlayerIds: inactivePlayerIds,
                afkPausedPlayerIds: inactivePlayerIds,
                afkPauseStartedAtMs: ctx.snapshot.nowMs,
                afkPauseBaseline: [],
            },
            reason: "pre-play afk pause started",
        };
    },
};

const afkPauseRule: MainRule = {
    name: "afkPauseRule",
    when: (ctx) => ctx.state.afkCheck !== null,
    plan: (ctx) => {
        const check = ctx.state.afkCheck;
        if (!check) {
            return {
                actions: [],
                state: ctx.state,
                reason: "afk check unavailable",
            };
        }

        const waitingPlayerIds = check.playerIds.filter((playerId) => {
            const player = ctx.fieldPlayers.find(
                (candidate) => candidate.id === playerId,
            );
            const lastActivityAt = getLastActivityAt(ctx.state, playerId);

            return (
                player?.playable === true &&
                !ctx.afkPlayerIds.has(playerId) &&
                (lastActivityAt === null || lastActivityAt < check.startedAtMs)
            );
        });

        if (waitingPlayerIds.length === 0) {
            return {
                actions: [
                    {
                        type: "pause-game",
                        paused: false,
                        reason: "afk-warning-cleared",
                    },
                    { type: "set-pre-play-timeout-hold", held: false },
                    {
                        type: "send-message",
                        to: "room",
                        message: { id: "manager.afk.pause-ended" },
                    },
                ],
                state: clearAfkPauseState(ctx.state, ctx.snapshot.nowMs),
                reason: "afk warning cleared",
            };
        }

        if (ctx.snapshot.nowMs - check.startedAtMs < AFK_PRE_PLAY_GRACE_MS) {
            return {
                actions: [],
                state: ctx.state,
                reason: "afk pause waiting",
            };
        }

        const expiredPlayers = ctx.fieldPlayers.filter((player) =>
            waitingPlayerIds.includes(player.id),
        );
        const expiredPlayerActions =
            expiredPlayers.flatMap<RoomManagementAction>((player) => [
                {
                    type: "move-player",
                    playerId: player.id,
                    team: Team.SPECTATORS,
                    reason: "afk",
                },
                {
                    type: "send-message",
                    to: player.id,
                    message: { id: "manager.afk.marked" },
                },
                {
                    type: "emit-event",
                    event: "manager-afk",
                    payload: {
                        playerId: player.id,
                        afk: true,
                    },
                },
            ]);
        return {
            actions: [
                {
                    type: "pause-game",
                    paused: false,
                    reason: "afk-warning-cleared",
                },
                { type: "set-pre-play-timeout-hold", held: false },
                ...expiredPlayerActions,
                {
                    type: "send-message",
                    to: "room",
                    message: {
                        id: "manager.afk.public-marked",
                        players: expiredPlayers,
                    },
                },
                {
                    type: "send-message",
                    to: "room",
                    message: { id: "manager.afk.pause-ended" },
                },
            ],
            state: {
                ...clearAfkPauseState(ctx.state, ctx.snapshot.nowMs),
                autoAfkPlayerIds: Array.from(
                    new Set([
                        ...ctx.state.autoAfkPlayerIds,
                        ...waitingPlayerIds,
                    ]),
                ),
                afkWarningPlayerIds: [],
                pendingVisibleAction: null,
            },
            reason: "afk pause expired",
        };
    },
};

const reconcileRosterOwnershipRule: MainRule = {
    name: "reconcileRosterOwnershipRule",
    when: (ctx) => {
        if (ctx.desiredMode !== "flag" && ctx.desiredMode !== "classic") {
            return false;
        }

        if (ctx.currentFieldRoster.length === 0) return false;
        if (needsModeSync(ctx)) return false;

        if (ctx.standardCurrentRoster) {
            return (
                ctx.state.activeRoster === null ||
                ctx.state.activeRoster.mode !== ctx.desiredMode ||
                !rostersMatch(
                    ctx.state.activeRoster.players,
                    ctx.standardCurrentRoster,
                )
            );
        }

        return ctx.state.activeRoster !== null;
    },
    plan: (ctx) => ({
        actions: [],
        state: {
            ...ctx.state,
            activeRoster:
                ctx.standardCurrentRoster &&
                ctx.desiredMode !== "idle" &&
                ctx.desiredMode !== "training"
                    ? {
                          mode: ctx.desiredMode,
                          players: ctx.standardCurrentRoster,
                          startedAtMs: ctx.snapshot.nowMs,
                      }
                    : null,
        },
        reason: ctx.standardCurrentRoster
            ? "standard roster adopted"
            : "external roster preserved",
    }),
};

const adoptStandardRosterRule: MainRule = {
    name: "adoptStandardRosterRule",
    when: (ctx) =>
        ctx.state.activeRoster === null &&
        ctx.standardCurrentRoster !== null &&
        !needsModeSync(ctx),
    plan: (ctx) => ({
        actions: [],
        state: {
            ...ctx.state,
            activeRoster:
                ctx.desiredMode === "idle" || !ctx.standardCurrentRoster
                    ? null
                    : {
                          mode: ctx.desiredMode,
                          players: ctx.standardCurrentRoster,
                          startedAtMs: ctx.snapshot.nowMs,
                      },
        },
        reason: "standard roster adopted",
    }),
};

const pendingVisibleActionRule: MainRule = {
    name: "pendingVisibleActionRule",
    when: (ctx) => ctx.state.pendingVisibleAction !== null,
    plan: (ctx, { allowPendingVisibleActionExecution = false } = {}) => {
        const pending = ctx.state.pendingVisibleAction;
        if (!pending) {
            return {
                actions: [],
                state: ctx.state,
                reason: "pending action unavailable",
            };
        }

        if (!needsModeSync(ctx)) {
            return {
                actions: [],
                state: {
                    ...ctx.state,
                    pendingVisibleAction: null,
                },
                reason: "pending mode sync no longer needed",
            };
        }

        if (pending.stage === "after-stop") {
            if (pending.desiredMode !== ctx.desiredMode) {
                return {
                    actions: [],
                    state: schedulePendingVisibleAction(
                        ctx,
                        "mode sync changed",
                    ),
                    reason: "pending mode sync coalesced",
                };
            }

            if (ctx.snapshot.nowMs < pending.executeAtMs) {
                return {
                    actions: [],
                    state: ctx.state,
                    reason: "pending visible action waiting",
                };
            }

            if (!allowPendingVisibleActionExecution) {
                return {
                    actions: [],
                    state: ctx.state,
                    reason: "pending visible action ready",
                };
            }

            if (ctx.snapshot.game.running) {
                return {
                    actions: [],
                    state: ctx.state,
                    reason: "waiting for stopped game",
                };
            }

            return {
                actions: getModeSyncActions(ctx),
                state: getStateAfterModeSync(ctx),
                reason: pending.reason,
            };
        }

        if (
            pending.desiredMode !== ctx.desiredMode ||
            pending.snapshotKey !== ctx.modeSyncSnapshotKey
        ) {
            return {
                actions: [],
                state: schedulePendingVisibleAction(ctx, "mode sync changed"),
                reason: "pending mode sync coalesced",
            };
        }

        if (ctx.snapshot.nowMs < pending.executeAtMs) {
            return {
                actions: [],
                state: ctx.state,
                reason: "pending visible action waiting",
            };
        }

        if (!allowPendingVisibleActionExecution) {
            return {
                actions: [],
                state: ctx.state,
                reason: "pending visible action ready",
            };
        }

        if (!ctx.canApplyVisibleGameChange) {
            return {
                actions: [],
                state: ctx.state,
                reason: "waiting for game boundary",
            };
        }

        if (requiresRunningGameRestart(ctx)) {
            return {
                actions: getStopForModeRestartActions(),
                state: scheduleModeSyncAfterStop(ctx, pending.reason),
                reason: "mode sync stopping current game",
            };
        }

        return {
            actions: getModeSyncActions(ctx),
            state: getStateAfterModeSync(ctx),
            reason: pending.reason,
        };
    },
};

const thresholdChangeRule: MainRule = {
    name: "thresholdChangeRule",
    when: needsModeSync,
    plan: (ctx) => {
        if (ctx.snapshot.config.visibleActionDelayMs > 0) {
            return {
                actions: [],
                state: schedulePendingVisibleAction(ctx, "mode sync scheduled"),
                reason: "mode sync scheduled",
            };
        }

        if (!ctx.canApplyVisibleGameChange) {
            return {
                actions: [],
                state: ctx.state,
                reason: "waiting for game boundary",
            };
        }

        if (requiresRunningGameRestart(ctx)) {
            return {
                actions: getStopForModeRestartActions(),
                state: scheduleModeSyncAfterStop(ctx, "mode sync scheduled"),
                reason: "mode sync stopping current game",
            };
        }

        return {
            actions: getModeSyncActions(ctx),
            state: getStateAfterModeSync(ctx),
            reason: "mode sync immediate",
        };
    },
};

const activeMatchNoopRule: MainRule = {
    name: "activeMatchNoopRule",
    when: () => true,
    plan: (ctx) => ({
        actions: [],
        state: ctx.state,
        reason: "no action",
    }),
};

export const managerRules = [
    disabledRule,
    suspendedRule,
    shortageRule,
    readinessRule,
    reconcileRosterOwnershipRule,
    afkPauseRule,
    afkPrePlayCheckRule,
    adoptStandardRosterRule,
    pendingVisibleActionRule,
    thresholdChangeRule,
    activeMatchNoopRule,
] as const satisfies readonly MainRule[];

export function planRoomManagement(
    snapshot: RoomManagementSnapshot,
    state: RoomManagerState,
    options: RoomManagementPlanningOptions = {},
): RoomManagementDecision {
    const ctx = deriveManagerContext(snapshot, state);
    const invariantActions = getInvariantActions(ctx);

    for (const rule of managerRules) {
        if (!rule.when(ctx)) continue;

        const plan = rule.plan(ctx, options);

        return {
            actions: [...invariantActions, ...plan.actions],
            state: plan.state,
            trace: {
                matchedRules:
                    invariantActions.length > 0
                        ? ["invariantRule", rule.name]
                        : [rule.name],
                facts: ctx.facts,
                reason: plan.reason,
            },
        };
    }

    return {
        actions: invariantActions,
        state,
        trace: {
            matchedRules: invariantActions.length > 0 ? ["invariantRule"] : [],
            facts: ctx.facts,
            reason: "no matching rule",
        },
    };
}

export function recordPlayerActivity(
    state: RoomManagerState,
    playerId: number,
    atMs: number,
): RoomManagerState {
    return {
        ...state,
        autoAfkPlayerIds: state.autoAfkPlayerIds.filter(
            (candidate) => candidate !== playerId,
        ),
        afkWarningPlayerIds: state.afkWarningPlayerIds.filter(
            (candidate) => candidate !== playerId,
        ),
        afkPausedPlayerIds: state.afkPausedPlayerIds.filter(
            (candidate) => candidate !== playerId,
        ),
        afkPauseBaseline: state.afkPauseBaseline.filter(
            (entry) => entry.playerId !== playerId,
        ),
        afkCheck: state.afkCheck
            ? {
                  ...state.afkCheck,
                  playerIds: state.afkCheck.playerIds.filter(
                      (candidate) => candidate !== playerId,
                  ),
                  warningSentPlayerIds:
                      state.afkCheck.warningSentPlayerIds.filter(
                          (candidate) => candidate !== playerId,
                      ),
              }
            : null,
        afkReminderAt: state.afkReminderAt.filter(
            (entry) => entry.playerId !== playerId,
        ),
        lastActivity: [
            ...state.lastActivity.filter(
                (entry) => entry.playerId !== playerId,
            ),
            { playerId, atMs },
        ],
    };
}

export function setManagerStatus(
    state: RoomManagerState,
    status: RoomManagerState["status"],
): RoomManagerState {
    return {
        ...state,
        status,
        suspension: status === "suspended" ? state.suspension : null,
        pendingVisibleAction:
            status === "active" ? state.pendingVisibleAction : null,
    };
}

export function setPlayerAfk(
    state: RoomManagerState,
    playerId: number,
    afk: boolean,
): RoomManagerState {
    const nextManualAfkPlayerIds = afk
        ? Array.from(new Set([...state.manualAfkPlayerIds, playerId]))
        : state.manualAfkPlayerIds.filter(
              (candidate) => candidate !== playerId,
          );

    return {
        ...state,
        manualAfkPlayerIds: nextManualAfkPlayerIds,
        autoAfkPlayerIds: state.autoAfkPlayerIds.filter(
            (candidate) => candidate !== playerId,
        ),
        afkWarningPlayerIds: state.afkWarningPlayerIds.filter(
            (candidate) => candidate !== playerId,
        ),
        afkPausedPlayerIds: state.afkPausedPlayerIds.filter(
            (candidate) => candidate !== playerId,
        ),
        afkPauseBaseline: state.afkPauseBaseline.filter(
            (entry) => entry.playerId !== playerId,
        ),
        afkCheck: state.afkCheck
            ? {
                  ...state.afkCheck,
                  playerIds: state.afkCheck.playerIds.filter(
                      (candidate) => candidate !== playerId,
                  ),
                  warningSentPlayerIds:
                      state.afkCheck.warningSentPlayerIds.filter(
                          (candidate) => candidate !== playerId,
                      ),
              }
            : null,
        afkReminderAt: state.afkReminderAt.filter(
            (entry) => entry.playerId !== playerId,
        ),
        pendingVisibleAction: null,
    };
}
