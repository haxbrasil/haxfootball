import { describe, expect, it, vi } from "vitest";
import { GAME_BALL_DISC_REF, NATIVE_CLOCK_BALL_DISC_ID } from "@core/ball";
import { Room } from "@core/room";
import { flushRuntime, installRuntime } from "@runtime/runtime";
import { $syncNativeBallCameraTarget } from "./camera";

describe("Flag camera hook", () => {
    it("tracks the carrier declared by the state", () => {
        const rawRoom = {
            getDiscProperties: vi.fn<
                (discRef: number | string) => DiscPropertiesObject | null
            >((discRef) =>
                discRef === GAME_BALL_DISC_REF
                    ? { x: 120, y: -30 }
                    : { x: 0, y: 0 },
            ),
            getPlayerDiscProperties: vi.fn<
                (playerId: number) => DiscPropertiesObject | null
            >(() => ({ x: 20, y: 10 })),
            setDiscProperties:
                vi.fn<
                    (
                        discRef: number | string,
                        properties: DiscPropertiesObject,
                    ) => void
                >(),
        } as unknown as RoomObject;
        const room = new Room(rawRoom);
        room.setBallDiscRef(GAME_BALL_DISC_REF);
        const uninstall = installRuntime({ room, config: {} });

        try {
            $syncNativeBallCameraTarget(7);
            flushRuntime();

            expect(rawRoom.getPlayerDiscProperties).toHaveBeenCalledWith(7);
            expect(rawRoom.setDiscProperties).toHaveBeenCalledWith(
                NATIVE_CLOCK_BALL_DISC_ID,
                { x: 20, y: 10 },
            );
        } finally {
            uninstall();
        }
    });
});
