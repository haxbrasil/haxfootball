import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RoomAuthorization } from "../domain/authorization";
import type { Room } from "@core/room";

let createPlayerAccessModule: typeof import("./player-access").createPlayerAccessModule;

beforeAll(async () => {
    vi.stubEnv("DEBUG", "false");
    vi.stubEnv("TUTORIAL_LINK", "https://example.com/tutorial");
    vi.stubEnv("DISCORD_LINK", "https://example.com/discord");
    ({ createPlayerAccessModule } = await import("./player-access"));
});

afterAll(() => {
    vi.unstubAllEnvs();
});

describe("native admin continuity", () => {
    it("assigns and reassigns the first available player", () => {
        const first = createPlayer(1, "First");
        const second = createPlayer(2, "Second");
        let players = [first];
        const setAdmin = vi.fn<(player: PlayerObject, admin: boolean) => void>(
            (player, admin) => {
                player.admin = admin;
            },
        );
        const room = {
            getPlayerList: () => players,
            setAdmin,
        } as unknown as Room;
        const module = createPlayerAccessModule({
            authorization: authorization(),
            autoManageNativeAdmins: true,
        });

        module.call("onPlayerJoin", room, first);
        expect(setAdmin).toHaveBeenLastCalledWith(first, true);

        players = [second];
        module.call("onPlayerLeave", room, first);
        expect(setAdmin).toHaveBeenLastCalledWith(second, true);

        second.admin = false;
        module.call("onPlayerAdminChange", room, second, null);
        expect(setAdmin).toHaveBeenLastCalledWith(second, true);
        expect(setAdmin).toHaveBeenCalledTimes(3);
    });

    it("does not grant another admin when one already exists", () => {
        const first = createPlayer(1, "First", true);
        const second = createPlayer(2, "Second");
        const setAdmin =
            vi.fn<(player: PlayerObject, admin: boolean) => void>();
        const room = {
            getPlayerList: () => [first, second],
            setAdmin,
        } as unknown as Room;
        const module = createPlayerAccessModule({
            authorization: authorization(),
            autoManageNativeAdmins: true,
        });

        module.call("onPlayerJoin", room, second);

        expect(setAdmin).not.toHaveBeenCalled();
    });
});

function createPlayer(id: number, name: string, admin = false): PlayerObject {
    return {
        id,
        name,
        team: 0,
        admin,
        auth: "",
        conn: "",
        ip: `ip-${id}`,
    } as PlayerObject;
}

function authorization(): RoomAuthorization {
    return {
        canUseManagementCommand: () => false,
        canChangeGameMode: () => false,
        canUseGameCorrectionCommand: () => false,
        canKickOrBan: () => false,
        canSeeManagementCommands: () => false,
    };
}
