import type { GameScore } from "./game-score";
import type { GameModeName, GameModeCompletedResult } from "@modes/types";
import type { GameStateInspection } from "@runtime/inspection";
import type { Checkpoint, CheckpointRestoreArgs } from "@runtime/runtime";

export type GameRuntimeSnapshot = {
    selectedMode: GameModeName;
    activeMode: GameModeName | null;
    running: boolean;
    paused: boolean;
    inspection: GameStateInspection | null;
    diagnosticStateKey: string | null;
    checkpoints: readonly Checkpoint[];
    score: GameScore | null;
    result: GameModeCompletedResult | null;
};

export type GameRuntimeOperations = {
    restoreCheckpoint(args?: CheckpointRestoreArgs): void;
    setPrePlayTimeoutHold(held: boolean): void;
};

export type GameRuntimeStore = {
    get(): GameRuntimeSnapshot;
    set(snapshot: GameRuntimeSnapshot): void;
    reset(snapshot: GameRuntimeSnapshot): void;
    setOperations(operations: GameRuntimeOperations | null): void;
    restoreCheckpoint(args?: CheckpointRestoreArgs): void;
    setPrePlayTimeoutHold(held: boolean): void;
};

export function createIdleGameRuntimeSnapshot(
    selectedMode: GameModeName,
    result: GameModeCompletedResult | null = null,
): GameRuntimeSnapshot {
    return {
        selectedMode,
        activeMode: null,
        running: false,
        paused: false,
        inspection: null,
        diagnosticStateKey: null,
        checkpoints: [],
        score: null,
        result,
    };
}

export function createGameRuntimeStore(
    initialSnapshot: GameRuntimeSnapshot,
): GameRuntimeStore {
    let snapshot = initialSnapshot;
    let operations: GameRuntimeOperations | null = null;

    return {
        get: () => snapshot,
        set: (nextSnapshot) => {
            snapshot = nextSnapshot;
        },
        reset: (nextSnapshot) => {
            snapshot = nextSnapshot;
            operations = null;
        },
        setOperations: (nextOperations) => {
            operations = nextOperations;
        },
        restoreCheckpoint: (args) => {
            operations?.restoreCheckpoint(args);
        },
        setPrePlayTimeoutHold: (held) => {
            operations?.setPrePlayTimeoutHold(held);
        },
    };
}
