import { describe, expect, it, vi } from "vitest";
import type { Room } from "@core/room";
import { createGameModeStore } from "../domain/game-mode";
import {
    createGameRuntimeStore,
    createIdleGameRuntimeSnapshot,
} from "../domain/game-runtime";
import { createRoomManagerModule } from "./room-manager";

describe("room manager launch disable", () => {
    it.each(["on", "resume"])(
        "does not allow !manager %s to override launch configuration",
        (subcommand) => {
            const send = vi.fn<(payload: unknown) => void>();
            const gameModeStore = createGameModeStore();
            const module = createRoomManagerModule({
                allowGuestPlay: false,
                afkActivityDetectionEnabled: false,
                authorization: {
                    canUseManagementCommand: () => true,
                    canChangeGameMode: () => true,
                    canUseGameCorrectionCommand: () => true,
                    canKickOrBan: () => true,
                    canSeeManagementCommands: () => true,
                },
                enabled: false,
                gameModeStore,
                gameRuntimeStore: createGameRuntimeStore(
                    createIdleGameRuntimeSnapshot(gameModeStore.get()),
                ),
                getPlayerSession: () => null,
                managedRoom: true,
            });
            const player = {
                id: 1,
                name: "Admin",
                admin: true,
            } as PlayerObject;

            const responses = module.callCommand(
                { send } as unknown as Room,
                player,
                {
                    prefix: "!",
                    name: "manager",
                    args: [subcommand],
                    raw: `!manager ${subcommand}`,
                },
            );

            expect(responses).toEqual([{ hideMessage: true }]);
            expect(send).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        "disabled when this room was launched",
                    ),
                    to: player.id,
                }),
            );
        },
    );
});
