import { COLOR } from "@common/general/color";
import { formatNames } from "@common/presentation/format-names";
import { COMMAND_PREFIX, type CommandSpec } from "@core/commands";
import { createModule, type Module } from "@core/module";
import type { Room } from "@core/room";
import { getGameModeDefinition } from "@modes/registry";
import { GAME_MODE, type GameModeName } from "@modes/types";
import { Team, isFieldTeam } from "@runtime/models";
import { t } from "@lingui/core/macro";
import type { RoomAuthorization } from "../domain/authorization";
import { CommandCategory } from "../domain/command-categories";
import type { GameModeStore } from "../domain/game-mode";
import { applyGameModeRoomSettings } from "../domain/game-mode-room-settings";
import type { GameRuntimeStore } from "../domain/game-runtime";
import type { PlayerSessionReader } from "../domain/player-sessions";
import {
    DEFAULT_ROOM_MANAGER_STATE,
    ROOM_MANAGER_DEFAULT_VISIBLE_ACTION_DELAY_MS,
    planRoomManagement,
    recordPlayerActivity,
    setManagerStatus,
    setPlayerAfk,
    type RoomManagementAction,
    type RoomManagementMessage,
    type RoomManagementPlanningOptions,
    type RoomManagementPlayer,
    type RoomManagementSnapshot,
    type RoomManagerEventSink,
    type RoomManagerState,
} from "../domain/room-manager";

const ROOM_MANAGER_COMMAND = {
    MANAGER: "manager",
    AFK: "afk",
} as const;

type RoomManagerModuleOptions = {
    authorization: RoomAuthorization;
    enabled: boolean;
    afkActivityDetectionEnabled: boolean;
    managedRoom: boolean;
    gameModeStore: GameModeStore;
    gameRuntimeStore: GameRuntimeStore;
    getPlayerSession: PlayerSessionReader;
    eventSink?: RoomManagerEventSink;
    visibleActionDelayMs?: number;
};

function getPlayerEligibility({
    managedRoom,
    playerId,
    getPlayerSession,
}: {
    managedRoom: boolean;
    playerId: number;
    getPlayerSession: PlayerSessionReader;
}): Pick<RoomManagementPlayer, "playable" | "playBlockedReason"> {
    if (!managedRoom) {
        return { playable: true, playBlockedReason: "none" };
    }

    const session = getPlayerSession(playerId);

    switch (session?.kind) {
        case "signed-in":
            return { playable: true, playBlockedReason: "none" };
        case "signing-in":
            return { playable: false, playBlockedReason: "signing-in" };
        case "guest":
            return { playable: false, playBlockedReason: "guest" };
        case "resolving":
        case undefined:
            return { playable: false, playBlockedReason: "resolving" };
    }
}

function formatPlayerName(
    player: Pick<RoomManagementPlayer, "id" | "name">,
): string {
    return player.name.length > 0 ? player.name : `Player ${player.id}`;
}

function formatTeamName(team: TeamID): string {
    switch (team) {
        case Team.RED:
            return t`Red`;
        case Team.BLUE:
            return t`Blue`;
        default:
            return t`their team`;
    }
}

function formatManagerMessage(message: RoomManagementMessage): string {
    switch (message.id) {
        case "manager.mode.idle":
            return t`🧭 Moved everyone to spectators.`;
        case "manager.mode.training":
            return t`🧭 Switched to Training.`;
        case "manager.mode.flag":
            return t`🧭 Switched to Flag.`;
        case "manager.mode.classic":
            return t`🧭 Switched to Classic.`;
        case "manager.eligibility.register":
            return t`🔐 Please register and sign in to play. You can stay as a spectator until then.`;
        case "manager.status.enabled":
            return t`🧭 Management enabled.`;
        case "manager.status.disabled":
            return t`🧭 Management disabled. Teams remain locked.`;
        case "manager.status.resumed":
            return t`🧭 Management resumed.`;
        case "manager.status.suspended":
            return t`🧭 Management suspended after manual admin control.`;
        case "manager.afk.marked":
            return t`🧭 You were marked AFK.`;
        case "manager.afk.enabled":
            return t`🧭 You are now AFK.`;
        case "manager.afk.disabled":
            return t`🧭 You are no longer AFK.`;
        case "manager.afk.resumed":
            return t`🧭 You are active again.`;
        case "manager.afk.warning":
            return t`⚠️ You were marked inactive. Move or press a key now to avoid being moved to spectators.`;
        case "manager.afk.public-warning": {
            const playerName = formatPlayerName(message.player);

            return t`⚠️ ${playerName} is AFK. The game is paused until they show activity.`;
        }
        case "manager.afk.public-marked": {
            const playerNames =
                message.players.length > 0
                    ? formatNames(message.players)
                    : t`A player`;

            return t`🧭 ${playerNames} moved to spectators for inactivity.`;
        }
        case "manager.afk.pause-ended":
            return t`✅ AFK pause ended. Resuming play.`;
        case "manager.afk.unavailable":
            return t`⚠️ You can only use !afk before the play starts.`;
        case "manager.readiness.waiting":
            return t`🧭 Waiting for everyone to demonstrate presence before the first play.`;
        case "manager.readiness.public-marked": {
            const playerNames =
                message.players.length > 0
                    ? formatNames(message.players)
                    : t`A player`;

            return t`🧭 ${playerNames} moved to spectators for not showing presence.`;
        }
        case "manager.readiness.pause-ended":
            return t`✅ Presence check ended. Resuming play.`;
        case "manager.shortage.replaced": {
            const missingPlayer = formatPlayerName(message.missingPlayer);
            const replacementPlayer = formatPlayerName(
                message.replacementPlayer,
            );
            const replacementTeam = formatTeamName(message.replacementTeam);

            return t`🧭 ${missingPlayer} left, so ${replacementPlayer} took their spot on ${replacementTeam}.`;
        }
        case "manager.shortage.rebuild": {
            const missingPlayer = formatPlayerName(message.missingPlayer);

            return t`🧭 Teams were rebuilt after ${missingPlayer} left.`;
        }
    }
}

function getSendTarget(
    to: "room" | number | readonly number[],
): null | number | number[] {
    if (to === "room") return null;
    if (typeof to === "number") return to;

    return [...to];
}

function getMessageColor(message: RoomManagementMessage): number {
    switch (message.id) {
        case "manager.eligibility.register":
        case "manager.afk.unavailable":
            return COLOR.WARNING;
        case "manager.status.disabled":
        case "manager.status.suspended":
            return COLOR.ADMIN;
        default:
            return COLOR.SYSTEM;
    }
}

function isManagerCommand(command: CommandSpec): boolean {
    return command.name === ROOM_MANAGER_COMMAND.MANAGER;
}

function isAfkCommand(command: CommandSpec): boolean {
    return command.name === ROOM_MANAGER_COMMAND.AFK;
}

function normalizeManagerSubcommand(command: CommandSpec): string {
    return (command.args[0] ?? "status").trim().toLowerCase();
}

export function createRoomManagerModule({
    afkActivityDetectionEnabled,
    authorization,
    enabled,
    eventSink,
    gameModeStore,
    gameRuntimeStore,
    getPlayerSession,
    managedRoom,
    visibleActionDelayMs = ROOM_MANAGER_DEFAULT_VISIBLE_ACTION_DELAY_MS,
}: RoomManagerModuleOptions): Module {
    let state: RoomManagerState = {
        ...DEFAULT_ROOM_MANAGER_STATE,
        status: enabled ? "active" : "disabled",
    };
    let teamsLocked = true;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    let ownActionDepth = 0;
    let replanAfterOwnAction = false;
    const avatarOverrides = new Map<number, string>();

    const clearPendingTimer = () => {
        if (!pendingTimer) return;
        clearTimeout(pendingTimer);
        pendingTimer = null;
    };

    const buildSnapshot = (room: Room): RoomManagementSnapshot => ({
        nowMs: Date.now(),
        players: room.getPlayerList().map((player) => ({
            id: player.id,
            name: player.name,
            team: player.team,
            admin: player.admin,
            ...getPlayerEligibility({
                managedRoom,
                playerId: player.id,
                getPlayerSession,
            }),
        })),
        teamsLocked,
        game: gameRuntimeStore.get(),
        config: {
            enabled,
            visibleActionDelayMs,
            managedRoom,
            afkActivityDetectionEnabled,
        },
    });

    const schedulePendingTimer = (room: Room) => {
        clearPendingTimer();

        const pending = state.pendingVisibleAction;
        if (!pending) return;

        const delayMs = Math.max(0, pending.executeAtMs - Date.now());
        pendingTimer = setTimeout(() => {
            pendingTimer = null;
            planAndExecute(room, {
                allowPendingVisibleActionExecution: true,
            });
        }, delayMs);
    };

    const sendMessage = (
        room: Room,
        to: "room" | number | readonly number[],
        message: RoomManagementMessage,
    ) => {
        const target = getSendTarget(to);

        room.send({
            message: formatManagerMessage(message),
            color: getMessageColor(message),
            ...(target === null ? {} : { to: target }),
            sound: "notification",
        });
    };

    const runOwnAction = (fn: () => void) => {
        ownActionDepth += 1;
        try {
            fn();
        } finally {
            ownActionDepth -= 1;
        }
    };

    const setMode = (room: Room, mode: GameModeName) => {
        gameModeStore.set(mode);
        applyGameModeRoomSettings(room, getGameModeDefinition(mode));
    };

    const executeAction = (room: Room, action: RoomManagementAction) => {
        switch (action.type) {
            case "lock-teams":
                runOwnAction(() => {
                    room.lockTeams();
                    teamsLocked = true;
                });
                return;
            case "move-player":
                if (room.getPlayer(action.playerId)) {
                    runOwnAction(() => {
                        room.setTeam(action.playerId, action.team);
                    });
                }
                return;
            case "reorder-spectators":
                runOwnAction(() => {
                    room.reorderPlayers([...action.playerIds], false);
                });
                return;
            case "set-mode":
                runOwnAction(() => {
                    setMode(room, action.mode);
                });
                return;
            case "start-game":
                runOwnAction(() => {
                    room.startGame();
                });
                return;
            case "stop-game":
                runOwnAction(() => {
                    gameRuntimeStore.stopGame();
                });
                return;
            case "pause-game":
                runOwnAction(() => {
                    room.pauseGame(action.paused);
                });
                return;
            case "set-pre-play-timeout-hold":
                gameRuntimeStore.setPrePlayTimeoutHold(action.held);
                return;
            case "set-avatar": {
                const currentAvatar = avatarOverrides.get(action.playerId);

                if (action.avatar === null) {
                    if (currentAvatar === undefined) return;
                    avatarOverrides.delete(action.playerId);
                    runOwnAction(() => {
                        room.setAvatar(action.playerId, null);
                    });
                    return;
                }

                if (currentAvatar === action.avatar) return;
                avatarOverrides.set(action.playerId, action.avatar);
                runOwnAction(() => {
                    room.setAvatar(action.playerId, action.avatar);
                });
                return;
            }
            case "restore-checkpoint":
                gameRuntimeStore.restoreCheckpoint(
                    action.checkpointId
                        ? { key: action.checkpointId }
                        : undefined,
                );
                return;
            case "send-message":
                sendMessage(room, action.to, action.message);
                return;
            case "emit-event":
                void eventSink?.({
                    type: action.event,
                    payload: action.payload,
                });
                return;
        }
    };

    const executeActions = (
        room: Room,
        actions: readonly RoomManagementAction[],
    ) => {
        if (actions.length === 0) return;

        ownActionDepth += 1;
        try {
            actions.forEach((action) => {
                executeAction(room, action);
            });
        } finally {
            ownActionDepth -= 1;
        }
    };

    function planAndExecute(
        room: Room,
        options: RoomManagementPlanningOptions = {},
    ) {
        try {
            if (ownActionDepth > 0) {
                replanAfterOwnAction = true;
                return;
            }

            const snapshot = buildSnapshot(room);
            const decision = planRoomManagement(snapshot, state, options);

            state = decision.state;
            schedulePendingTimer(room);
            executeActions(room, decision.actions);

            if (replanAfterOwnAction) {
                replanAfterOwnAction = false;
                planAndExecute(room);
            }
        } catch (error) {
            console.error("Room management failed:", error);
            clearPendingTimer();
            void eventSink?.({
                type: "manager-error",
                payload: {
                    message:
                        error instanceof Error ? error.message : String(error),
                },
            });
        }
    }

    const markActivity = (room: Room, player: PlayerObject) => {
        const wasInactive =
            state.autoAfkPlayerIds.includes(player.id) ||
            state.afkWarningPlayerIds.includes(player.id);

        state = recordPlayerActivity(state, player.id, Date.now());

        if (wasInactive) {
            sendMessage(room, player.id, { id: "manager.afk.resumed" });
        }

        planAndExecute(room);
    };

    const handleManagerCommand = (
        room: Room,
        player: PlayerObject,
        command: CommandSpec,
    ) => {
        if (!authorization.canUseManagementCommand(player)) {
            room.send({
                message: t`🚫 Only admins can use room manager commands.`,
                color: COLOR.ERROR,
                to: player.id,
                sound: "notification",
            });
            return { hideMessage: true };
        }

        const subcommand = normalizeManagerSubcommand(command);

        switch (subcommand) {
            case "on": {
                state = setManagerStatus(state, "active");
                sendMessage(room, "room", { id: "manager.status.enabled" });
                void eventSink?.({
                    type: "manager-state-change",
                    payload: {
                        status: "active",
                        reason: "manager-command",
                        byPlayerId: player.id,
                    },
                });
                planAndExecute(room);
                return { hideMessage: true };
            }
            case "off": {
                state = setManagerStatus(state, "disabled");
                clearPendingTimer();
                sendMessage(room, "room", { id: "manager.status.disabled" });
                void eventSink?.({
                    type: "manager-state-change",
                    payload: {
                        status: "disabled",
                        reason: "manager-command",
                        byPlayerId: player.id,
                    },
                });
                planAndExecute(room);
                return { hideMessage: true };
            }
            case "resume": {
                state = setManagerStatus(state, "active");
                sendMessage(room, "room", { id: "manager.status.resumed" });
                void eventSink?.({
                    type: "manager-state-change",
                    payload: {
                        status: "active",
                        reason: "manager-command",
                        byPlayerId: player.id,
                    },
                });
                planAndExecute(room);
                return { hideMessage: true };
            }
            case "status": {
                const decision = planRoomManagement(buildSnapshot(room), state);

                room.send({
                    message: t`🧭 Management status: ${state.status}. ${decision.trace.reason}.`,
                    color: COLOR.SYSTEM,
                    to: player.id,
                    sound: "notification",
                });
                return { hideMessage: true };
            }
            default: {
                room.send({
                    message: t`⚠️ Use !manager on, !manager off, !manager resume, or !manager status.`,
                    color: COLOR.WARNING,
                    to: player.id,
                    sound: "notification",
                });
                return { hideMessage: true };
            }
        }
    };

    const handleAfkCommand = (room: Room, player: PlayerObject) => {
        const snapshot = gameRuntimeStore.get();
        const canUseAfk =
            player.team === 0 ||
            snapshot.activeMode === GAME_MODE.TRAINING ||
            snapshot.selectedMode === GAME_MODE.TRAINING ||
            snapshot.inspection?.continuity === "before-play-start";

        if (!canUseAfk) {
            sendMessage(room, player.id, { id: "manager.afk.unavailable" });
            return { hideMessage: true };
        }

        const isAfk =
            state.manualAfkPlayerIds.includes(player.id) ||
            state.autoAfkPlayerIds.includes(player.id);
        state = setPlayerAfk(state, player.id, !isAfk);
        state = recordPlayerActivity(state, player.id, Date.now());
        void eventSink?.({
            type: "manager-afk",
            payload: {
                playerId: player.id,
                afk: !isAfk,
            },
        });
        sendMessage(room, player.id, {
            id: !isAfk ? "manager.afk.enabled" : "manager.afk.disabled",
        });

        if (!isAfk && player.team !== 0) {
            runOwnAction(() => {
                room.setTeam(player.id, 0);
            });
        }

        planAndExecute(room);
        return { hideMessage: true };
    };

    return createModule()
        .setCommands({
            spec: { prefix: COMMAND_PREFIX },
            commands: [
                {
                    name: ROOM_MANAGER_COMMAND.MANAGER,
                    category: CommandCategory.Admin,
                    description: t`Control algorithmic room management`,
                },
                {
                    name: ROOM_MANAGER_COMMAND.AFK,
                    category: CommandCategory.Room,
                    description: t`Toggle AFK status`,
                },
            ],
        })
        .onRoomLink((room) => {
            teamsLocked = true;
            planAndExecute(room);
        })
        .onBeforeOperation((room, operation) => {
            if (ownActionDepth > 0) return true;

            if (operation.kind === "input" && operation.byPlayer) {
                markActivity(room, operation.byPlayer);
                return true;
            }

            if (operation.kind === "teams-lock") {
                teamsLocked = operation.message.locked === true;

                if (!operation.message.locked) {
                    setTimeout(() => {
                        planAndExecute(room);
                    }, 0);
                }

                return true;
            }

            return true;
        })
        .onPlayerJoin((room, player) => {
            state = recordPlayerActivity(state, player.id, Date.now());
            planAndExecute(room);
        })
        .onPlayerLeave((room, player) => {
            const nowMs = Date.now();
            avatarOverrides.delete(player.id);
            const wasActiveRosterPlayer =
                state.activeRoster?.players.some(
                    (rosterPlayer) => rosterPlayer.playerId === player.id,
                ) === true;

            state = {
                ...state,
                shortage:
                    wasActiveRosterPlayer && isFieldTeam(player.team)
                        ? {
                              missingPlayerId: player.id,
                              missingPlayerName: player.name,
                              previousTeam: player.team,
                              replacementPlayerId: null,
                              replacementAtMs: nowMs,
                              originalReturnExpiresAtMs: nowMs + 30_000,
                          }
                        : state.shortage,
                manualAfkPlayerIds: state.manualAfkPlayerIds.filter(
                    (playerId) => playerId !== player.id,
                ),
                autoAfkPlayerIds: state.autoAfkPlayerIds.filter(
                    (playerId) => playerId !== player.id,
                ),
                afkWarningPlayerIds: state.afkWarningPlayerIds.filter(
                    (playerId) => playerId !== player.id,
                ),
                afkPausedPlayerIds: state.afkPausedPlayerIds.filter(
                    (playerId) => playerId !== player.id,
                ),
                afkPauseBaseline: state.afkPauseBaseline.filter(
                    (entry) => entry.playerId !== player.id,
                ),
                afkCheck: state.afkCheck
                    ? {
                          ...state.afkCheck,
                          playerIds: state.afkCheck.playerIds.filter(
                              (playerId) => playerId !== player.id,
                          ),
                          warningSentPlayerIds:
                              state.afkCheck.warningSentPlayerIds.filter(
                                  (playerId) => playerId !== player.id,
                              ),
                      }
                    : null,
                lastActivity: state.lastActivity.filter(
                    (activity) => activity.playerId !== player.id,
                ),
            };
            planAndExecute(room);
        })
        .onPlayerActivity((room, player) => {
            markActivity(room, player);
        })
        .onPlayerChat((room, player) => {
            markActivity(room, player);
        })
        .onPlayerTeamChange((room, _changedPlayer, _byPlayer) => {
            planAndExecute(room);
        })
        .onGameStart((room) => {
            planAndExecute(room);
        })
        .onGameStop((room) => {
            planAndExecute(room);
        })
        .onGameTick((room) => {
            planAndExecute(room);
        })
        .onPlayerSendCommand((room, player, command) => {
            state = recordPlayerActivity(state, player.id, Date.now());

            if (isManagerCommand(command)) {
                return handleManagerCommand(room, player, command);
            }

            if (isAfkCommand(command)) {
                return handleAfkCommand(room, player);
            }

            return undefined;
        });
}
