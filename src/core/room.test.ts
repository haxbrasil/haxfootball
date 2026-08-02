import { describe, expect, it, vi } from "vitest";
import {
    GAME_BALL_DISC_REF,
    NATIVE_CLOCK_BALL_DISC_ID,
    NATIVE_CLOCK_BALL_START_SPEED,
} from "@core/ball";
import { Room, type DiscRef } from "@core/room";

function createRawRoom({
    gameStatus = "running",
}: {
    gameStatus?: GameStatus;
} = {}) {
    const discs = new Map<DiscRef, DiscPropertiesObject>([
        [NATIVE_CLOCK_BALL_DISC_ID, { x: 0, y: 0 }],
        [
            GAME_BALL_DISC_REF,
            { x: 120, y: -30, radius: 7.85, xspeed: 2, yspeed: -1 },
        ],
    ]);
    let status = gameStatus;

    const room = {
        getBallPosition: vi.fn<() => Position>(() => ({ x: 0, y: 0 })),
        getDiscProperties: vi.fn<
            (discRef: DiscRef) => DiscPropertiesObject | null
        >((discRef) => discs.get(discRef) ?? null),
        setDiscProperties: vi.fn<
            (discRef: DiscRef, properties: DiscPropertiesObject) => void
        >((discRef: DiscRef, properties: DiscPropertiesObject) => {
            discs.set(discRef, {
                ...discs.get(discRef),
                ...properties,
            });
        }),
        getGameStatus: vi.fn<() => GameStatus>(() => status),
        setSoftKickoff: vi.fn<(team: Exclude<TeamID, 0>) => void>(),
    } as unknown as RoomObject;

    return {
        raw: room,
        room: new Room(room),
        setGameStatus(nextStatus: GameStatus) {
            status = nextStatus;
        },
    };
}

describe("Room game ball", () => {
    it("resolves ball reads and writes through the configured disc reference", () => {
        const { raw, room } = createRawRoom();

        room.setBallDiscRef(GAME_BALL_DISC_REF);

        expect(room.getBallPosition()).toEqual({ x: 120, y: -30 });
        expect(room.getBallProperties()).toMatchObject({
            radius: 7.85,
            xspeed: 2,
            yspeed: -1,
        });

        room.setBallProperties({ x: 140, y: 15 });

        expect(raw.setDiscProperties).toHaveBeenCalledWith(GAME_BALL_DISC_REF, {
            x: 140,
            y: 15,
        });
        expect(room.getBallPosition()).toEqual({ x: 140, y: 15 });
        expect(room.getNativeBallPosition()).toEqual({ x: 0, y: 0 });
    });
});

describe("Room game clock", () => {
    it("stops through soft kickoff and resets the native clock ball", () => {
        const { raw, room } = createRawRoom();
        room.setBallDiscRef(GAME_BALL_DISC_REF);

        room.stopGameClock(1);

        expect(raw.setSoftKickoff).toHaveBeenCalledWith(1);
        expect(raw.setDiscProperties).toHaveBeenCalledWith(
            NATIVE_CLOCK_BALL_DISC_ID,
            expect.objectContaining({
                x: 0,
                y: 0,
                xspeed: 0,
                yspeed: 0,
            }),
        );
    });

    it("defers soft kickoff while paused until the first running tick", () => {
        const { raw, room, setGameStatus } = createRawRoom({
            gameStatus: "paused",
        });
        room.setBallDiscRef(GAME_BALL_DISC_REF);

        room.stopGameClock(2);
        expect(raw.setSoftKickoff).not.toHaveBeenCalled();

        setGameStatus("resuming");
        room.flushPendingGameClockStop();
        expect(raw.setSoftKickoff).not.toHaveBeenCalled();

        setGameStatus("running");
        room.flushPendingGameClockStop();
        expect(raw.setSoftKickoff).toHaveBeenCalledWith(2);
    });

    it("starts the clock by moving only the invisible native ball", () => {
        const { raw, room } = createRawRoom();
        room.setBallDiscRef(GAME_BALL_DISC_REF);

        room.startGameClock();

        expect(raw.setDiscProperties).toHaveBeenCalledWith(
            NATIVE_CLOCK_BALL_DISC_ID,
            expect.objectContaining({
                xspeed: NATIVE_CLOCK_BALL_START_SPEED,
                yspeed: 0,
            }),
        );
    });

    it("leaves native-ball modes unchanged", () => {
        const { raw, room } = createRawRoom();

        room.stopGameClock(1);
        room.startGameClock();

        expect(raw.setSoftKickoff).not.toHaveBeenCalled();
        expect(raw.setDiscProperties).not.toHaveBeenCalled();
    });

    it("does not repeat a soft kickoff while the clock is already stopped", () => {
        const { raw, room } = createRawRoom();
        room.setBallDiscRef(GAME_BALL_DISC_REF);

        room.stopGameClock(1);
        room.stopGameClock(1);

        expect(raw.setSoftKickoff).toHaveBeenCalledTimes(1);

        room.stopGameClock(2);

        expect(raw.setSoftKickoff).toHaveBeenNthCalledWith(2, 2);
    });
});
