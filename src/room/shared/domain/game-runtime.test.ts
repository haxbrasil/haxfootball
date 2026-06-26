import { describe, expect, it } from "vitest";
import {
    createGameRuntimeStore,
    createIdleGameRuntimeSnapshot,
} from "./game-runtime";

describe("createGameRuntimeStore", () => {
    it("forwards stop requests while runtime operations are active", () => {
        const calls: string[] = [];
        const store = createGameRuntimeStore(
            createIdleGameRuntimeSnapshot("training"),
        );

        store.setOperations({
            restoreCheckpoint: () => {
                calls.push("restore-checkpoint");
            },
            setPrePlayTimeoutHold: () => {
                calls.push("set-pre-play-timeout-hold");
            },
            stopGame: () => {
                calls.push("stop-game");
            },
        });

        store.stopGame();

        expect(calls).toEqual(["stop-game"]);
    });

    it("does not stop anything after runtime operations are reset", () => {
        const calls: string[] = [];
        const store = createGameRuntimeStore(
            createIdleGameRuntimeSnapshot("training"),
        );

        store.setOperations({
            restoreCheckpoint: () => {
                calls.push("restore-checkpoint");
            },
            setPrePlayTimeoutHold: () => {
                calls.push("set-pre-play-timeout-hold");
            },
            stopGame: () => {
                calls.push("stop-game");
            },
        });

        store.reset(createIdleGameRuntimeSnapshot("training"));
        store.stopGame();

        expect(calls).toEqual([]);
    });
});
