import { describe, expect, it, vi } from "vitest";
import { createEngine, type GameState, type StateRegistry } from "./engine";
import { $tick } from "./runtime";
import type { Room } from "@core/room";

function createRoomStub(): Room {
    return {
        invalidateCaches() {},
        getPlayerList() {
            return [];
        },
        getBallPosition() {
            return { x: 0, y: 0 };
        },
        getDiscProperties() {
            return null;
        },
    } as unknown as Room;
}

describe("createEngine", () => {
    it("does not advance state elapsed ticks while paused", () => {
        const recordElapsedTick = vi.fn<(tick: number) => void>();
        const registry: StateRegistry = {
            TEST: () => ({
                run(_state: GameState) {
                    recordElapsedTick($tick().current);
                },
            }),
        };
        const engine = createEngine(createRoomStub(), registry, {
            config: {},
        });

        engine.start("TEST");
        engine.tick();
        engine.handleGamePause(null);
        engine.tick();
        engine.tick();
        engine.handleGameUnpause(null);
        engine.tick();

        const elapsedTicks = recordElapsedTick.mock.calls.map(([tick]) => tick);

        expect(elapsedTicks).toEqual([0, 0, 0, 1]);
    });
});
