import type { Room } from "@core/room";
import { Team } from "@runtime/models";
import { describe, expect, it, vi } from "vitest";
import type { RoomAuthorization } from "../domain/authorization";
import { GAME_MODULE_COMMAND, handleGameModuleCommand } from "./game-commands";

describe("!swap", () => {
    it("swaps field teams while preserving spectators", () => {
        const red = createPlayer(1, "Red", Team.RED);
        const blue = createPlayer(2, "Blue", Team.BLUE);
        const spectator = createPlayer(3, "Spectator", Team.SPECTATORS);
        const setTeam = vi.fn<(player: PlayerObject, team: TeamID) => void>();
        const send = vi.fn<(payload: unknown) => void>();
        const room = {
            getPlayerList: () => [red, blue, spectator],
            setTeam,
            send,
        } as unknown as Room;

        const response = runSwap(room, red, true);

        expect(response).toEqual({ hideMessage: true });
        expect(setTeam).toHaveBeenCalledTimes(2);
        expect(setTeam).toHaveBeenNthCalledWith(1, red, Team.BLUE);
        expect(setTeam).toHaveBeenNthCalledWith(2, blue, Team.RED);
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining(
                    "swapped the red and blue teams",
                ),
            }),
        );
    });

    it("rejects non-admin players without moving anyone", () => {
        const player = createPlayer(1, "Player", Team.RED);
        const setTeam = vi.fn<(player: PlayerObject, team: TeamID) => void>();
        const send = vi.fn<(payload: unknown) => void>();
        const room = {
            getPlayerList: () => [player],
            setTeam,
            send,
        } as unknown as Room;

        const response = runSwap(room, player, false);

        expect(response).toEqual({ hideMessage: true });
        expect(setTeam).not.toHaveBeenCalled();
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining("Only admins"),
                to: player.id,
            }),
        );
    });
});

function runSwap(room: Room, player: PlayerObject, authorized: boolean) {
    return handleGameModuleCommand({
        applySelectedModeRoomSettings: () => {},
        authorization: {
            canUseManagementCommand: () => authorized,
            canChangeGameMode: () => authorized,
            canUseGameCorrectionCommand: () => authorized,
            canKickOrBan: () => authorized,
            canSeeManagementCommands: () => authorized,
        } satisfies RoomAuthorization,
        commandName: GAME_MODULE_COMMAND.SWAP,
        commandArgs: [],
        gameModeStore: {} as never,
        getSelectedModeDefinition: () => ({}) as never,
        isGameRunning: false,
        player,
        room,
        selectedModeDefinition: {} as never,
    });
}

function createPlayer(id: number, name: string, team: TeamID): PlayerObject {
    return {
        id,
        name,
        team,
        admin: false,
        auth: "",
        conn: "",
        ip: `ip-${id}`,
    } as PlayerObject;
}
