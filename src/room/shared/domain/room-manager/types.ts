import type { GameRuntimeSnapshot } from "../game-runtime";
import type { GameModeName } from "../game-mode";
import { Team, type FieldTeam } from "@runtime/models";

export type RoomManagerStatus = "active" | "suspended" | "disabled";

export type DesiredRoomMode = "idle" | "training" | "flag" | "classic";

export type RoomManagementPlayer = {
    id: number;
    name: string;
    team: TeamID;
    admin: boolean;
    playable: boolean;
    playBlockedReason: "none" | "guest" | "resolving" | "signing-in";
};

export type RoomManagementSnapshot = {
    nowMs: number;
    players: readonly RoomManagementPlayer[];
    teamsLocked: boolean;
    game: GameRuntimeSnapshot;
    config: {
        enabled: boolean;
        visibleActionDelayMs: number;
        managedRoom: boolean;
        afkActivityDetectionEnabled: boolean;
    };
};

export type RoomRosterPlayer = {
    playerId: number;
    team: FieldTeam;
    order: number;
};

export type ActiveRoster = {
    mode: Exclude<DesiredRoomMode, "idle">;
    players: readonly RoomRosterPlayer[];
    startedAtMs: number;
};

export type ShortageState = {
    missingPlayerId: number;
    missingPlayerName: string;
    previousTeam: FieldTeam;
    replacementPlayerId: number | null;
    replacementAtMs: number;
    originalReturnExpiresAtMs: number;
};

export type ReadinessState = {
    matchStartedAtMs: number;
    waitingPlayerIds: readonly number[];
    warningSentPlayerIds: readonly number[];
};

export type PrePlayAfkCheckState = {
    instanceKey: string;
    kind: "first-play" | "normal";
    playerIds: readonly number[];
    startedAtMs: number;
    warningSentPlayerIds: readonly number[];
};

export type PendingVisibleAction = {
    kind: "mode-sync";
    stage: "waiting" | "after-stop";
    desiredMode: DesiredRoomMode;
    executeAtMs: number;
    snapshotKey: string;
    reason: string;
};

export type ManagerSuspension = {
    reason: "native-admin-operation" | "manual-mode-command" | "manager-error";
    byPlayerId: number | null;
    atMs: number;
};

export type PlayerActivity = {
    playerId: number;
    atMs: number;
};

export type PlayerInactivity = {
    playerId: number;
    inactiveMs: number;
};

export type RoomManagerState = {
    status: RoomManagerStatus;
    manualAfkPlayerIds: readonly number[];
    autoAfkPlayerIds: readonly number[];
    afkWarningPlayerIds: readonly number[];
    afkPausedPlayerIds: readonly number[];
    afkPauseStartedAtMs: number | null;
    afkPauseBaseline: readonly PlayerInactivity[];
    afkCheck: PrePlayAfkCheckState | null;
    checkedPrePlayInstanceKeys: readonly string[];
    afkReminderAt: readonly PlayerActivity[];
    lastActivity: readonly PlayerActivity[];
    activeRoster: ActiveRoster | null;
    lastCompletedResultKey: string | null;
    shortage: ShortageState | null;
    readiness: ReadinessState | null;
    pendingVisibleAction: PendingVisibleAction | null;
    suspension: ManagerSuspension | null;
    ownActionUntilMs: number;
};

type RoomManagementPlayerReference = Pick<RoomManagementPlayer, "id" | "name">;

export type RoomManagementMessage =
    | {
          id:
              | "manager.mode.training"
              | "manager.mode.flag"
              | "manager.mode.classic"
              | "manager.mode.idle"
              | "manager.eligibility.register"
              | "manager.status.enabled"
              | "manager.status.disabled"
              | "manager.status.resumed"
              | "manager.status.suspended"
              | "manager.afk.marked"
              | "manager.afk.enabled"
              | "manager.afk.disabled"
              | "manager.afk.resumed"
              | "manager.afk.warning"
              | "manager.afk.pause-ended"
              | "manager.afk.unavailable"
              | "manager.readiness.waiting"
              | "manager.readiness.pause-ended";
      }
    | {
          id: "manager.afk.public-warning";
          player: RoomManagementPlayerReference;
      }
    | {
          id: "manager.afk.public-marked" | "manager.readiness.public-marked";
          players: readonly RoomManagementPlayerReference[];
      }
    | {
          id: "manager.shortage.replaced";
          missingPlayer: RoomManagementPlayerReference;
          replacementPlayer: RoomManagementPlayerReference;
          replacementTeam: FieldTeam;
      }
    | {
          id: "manager.shortage.rebuild";
          missingPlayer: RoomManagementPlayerReference;
      };

export type RoomManagementAction =
    | { type: "lock-teams" }
    | {
          type: "move-player";
          playerId: number;
          team: TeamID;
          reason:
              | "ineligible"
              | "mode-roster"
              | "afk"
              | "shortage"
              | "restore-original"
              | "idle";
      }
    | { type: "reorder-spectators"; playerIds: readonly number[] }
    | { type: "set-mode"; mode: GameModeName }
    | { type: "start-game" }
    | { type: "stop-game"; reason: string }
    | { type: "pause-game"; paused: boolean; reason: string }
    | { type: "set-pre-play-timeout-hold"; held: boolean }
    | { type: "set-avatar"; playerId: number; avatar: string | null }
    | {
          type: "restore-checkpoint";
          checkpointId?: string;
      }
    | {
          type: "send-message";
          to: "room" | number | readonly number[];
          message: RoomManagementMessage;
      }
    | {
          type: "emit-event";
          event:
              | "manager-state-change"
              | "manager-action"
              | "manager-afk"
              | "manager-shortage"
              | "manager-readiness"
              | "manager-error";
          payload: Record<string, number | string | boolean | null>;
      };

export type DecisionTrace = {
    matchedRules: readonly string[];
    facts: readonly string[];
    reason: string;
};

export type RoomManagementDecision = {
    actions: readonly RoomManagementAction[];
    state: RoomManagerState;
    trace: DecisionTrace;
};

export type RoomManagementPlanningOptions = {
    allowPendingVisibleActionExecution?: boolean;
};

export type RoomManagerEventSink = (event: {
    type: string;
    payload: Record<string, number | string | boolean | null>;
}) => void | Promise<void>;

export const ROOM_MANAGER_DEFAULT_VISIBLE_ACTION_DELAY_MS = 1_000;

export const DEFAULT_ROOM_MANAGER_STATE: RoomManagerState = {
    status: "active",
    manualAfkPlayerIds: [],
    autoAfkPlayerIds: [],
    afkWarningPlayerIds: [],
    afkPausedPlayerIds: [],
    afkPauseStartedAtMs: null,
    afkPauseBaseline: [],
    afkCheck: null,
    checkedPrePlayInstanceKeys: [],
    afkReminderAt: [],
    lastActivity: [],
    activeRoster: null,
    lastCompletedResultKey: null,
    shortage: null,
    readiness: null,
    pendingVisibleAction: null,
    suspension: null,
    ownActionUntilMs: 0,
};

export const SPECTATOR_TEAM: TeamID = Team.SPECTATORS;
