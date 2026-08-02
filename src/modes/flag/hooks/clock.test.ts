import { describe, expect, it, vi } from "vitest";
import { GAME_BALL_DISC_REF } from "@core/ball";
import { Room } from "@core/room";
import { flushRuntime, installRuntime } from "@runtime/runtime";
import { $startGameClock, $stopGameClock } from "./clock";

describe("Flag game clock hooks", () => {
    it("applies clock effects to the real room instance", () => {
        const rawRoom = {
            getGameStatus: vi.fn<() => GameStatus>(() => "running"),
            getDiscProperties: vi.fn<
                (discRef: number | string) => DiscPropertiesObject | null
            >(() => null),
            setDiscProperties:
                vi.fn<
                    (
                        discRef: number | string,
                        properties: DiscPropertiesObject,
                    ) => void
                >(),
            setSoftKickoff: vi.fn<(team: Exclude<TeamID, 0>) => void>(),
        } as unknown as RoomObject;
        const room = new Room(rawRoom);
        room.setBallDiscRef(GAME_BALL_DISC_REF);
        const uninstall = installRuntime({ room, config: {} });

        try {
            $stopGameClock(2);
            flushRuntime();

            expect(rawRoom.setSoftKickoff).toHaveBeenCalledWith(2);

            $startGameClock();
            flushRuntime();

            expect(rawRoom.setDiscProperties).toHaveBeenLastCalledWith(
                0,
                expect.objectContaining({ xspeed: expect.any(Number) }),
            );
        } finally {
            uninstall();
        }
    });
});
