import { afterEach, describe, expect, it, vi } from "vitest";

describe("room-server policy environment", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("parses explicit championship room controls", async () => {
        const env = await loadEnvironment({
            ROOM_ALLOW_GUEST_PLAY: "true",
            ROOM_AUTO_MANAGE_NATIVE_ADMINS: "false",
            ROOM_MIN_PERSISTED_MATCH_SECONDS: "4",
        });

        expect(env.allowGuestPlay).toBe(true);
        expect(env.autoManageNativeAdmins).toBe(false);
        expect(env.minimumPersistedMatchSeconds).toBe(4);
    });

    it("keeps both policies optional", async () => {
        const env = await loadEnvironment({
            ROOM_ALLOW_GUEST_PLAY: "",
            ROOM_AUTO_MANAGE_NATIVE_ADMINS: "",
            ROOM_MIN_PERSISTED_MATCH_SECONDS: "",
        });

        expect(env.allowGuestPlay).toBeUndefined();
        expect(env.autoManageNativeAdmins).toBeUndefined();
        expect(env.minimumPersistedMatchSeconds).toBeUndefined();
    });

    it("rejects negative persistence thresholds", async () => {
        await expect(
            loadEnvironment({ ROOM_MIN_PERSISTED_MATCH_SECONDS: "-1" }),
        ).rejects.toThrow(/ROOM_MIN_PERSISTED_MATCH_SECONDS|>=0/);
    });
});

async function loadEnvironment(overrides: Record<string, string>) {
    const required = {
        ROOM_NAME: "Test room",
        ROOM_PUBLIC: "false",
        MAX_PLAYERS: "20",
        NO_PLAYER: "true",
        TUTORIAL_LINK: "https://example.com/tutorial",
        DISCORD_LINK: "https://example.com/discord",
    };

    for (const [key, value] of Object.entries({ ...required, ...overrides })) {
        vi.stubEnv(key, value);
    }

    vi.resetModules();

    return (await import("./room-server")).env;
}
