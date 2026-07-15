import { afterEach, describe, expect, it, vi } from "vitest";
import type { Room } from "@core/room";

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe("room desync checker setup", () => {
    it("applies explicit desync checker settings", async () => {
        const module = await loadRoomSetupModule({
            HAXBALL_RS_DESYNC_CHECKER_ENABLED: "false",
            HAXBALL_RS_DESYNC_CHECKER_INTERVAL_TICKS: "120",
        });
        const room = createRoom();

        module.call("onRoomLink", room, "https://example.com/room");

        expect(room.setDesyncCheckerEnabled).toHaveBeenCalledWith(false);
        expect(room.setDesyncCheckerIntervalTicks).toHaveBeenCalledWith(120);
    });

    it("preserves haxball-rs defaults when settings are omitted", async () => {
        const module = await loadRoomSetupModule({
            HAXBALL_RS_DESYNC_CHECKER_ENABLED: "",
            HAXBALL_RS_DESYNC_CHECKER_INTERVAL_TICKS: "",
        });
        const room = createRoom();

        module.call("onRoomLink", room, "https://example.com/room");

        expect(room.setDesyncCheckerEnabled).not.toHaveBeenCalled();
        expect(room.setDesyncCheckerIntervalTicks).not.toHaveBeenCalled();
    });
});

async function loadRoomSetupModule(overrides: Record<string, string>) {
    const required = {
        DEBUG: "false",
        TUTORIAL_LINK: "https://example.com/tutorial",
        DISCORD_LINK: "https://example.com/discord",
    };

    for (const [key, value] of Object.entries({ ...required, ...overrides })) {
        vi.stubEnv(key, value);
    }

    vi.resetModules();

    const { createRoomSetupModule } = await import("./room-setup");

    return createRoomSetupModule();
}

function createRoom(): Room {
    return {
        lockTeams: vi.fn<Room["lockTeams"]>(),
        setScoreLimit: vi.fn<Room["setScoreLimit"]>(),
        setTimeLimit: vi.fn<Room["setTimeLimit"]>(),
        setDesyncCheckerEnabled: vi.fn<Room["setDesyncCheckerEnabled"]>(),
        setDesyncCheckerIntervalTicks:
            vi.fn<Room["setDesyncCheckerIntervalTicks"]>(),
    } as unknown as Room;
}
