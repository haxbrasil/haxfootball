import { afterEach, describe, expect, it, vi } from "vitest";
import type { Room } from "@core/room";
import { createPlayerSessionStore } from "@room/shared/domain/player-sessions";
import type {
    AttachLiveRoomInput,
    LiveRoomAttachment,
} from "@haxbrasil/haxfootball-api-sdk";
import {
    buildManagedLiveStateSnapshot,
    createManagedLiveStateModule,
} from "./live-state";

const attachLive = vi.hoisted(() =>
    vi.fn<(input: AttachLiveRoomInput) => Promise<LiveRoomAttachment>>(),
);

vi.mock("@api/client", () => ({
    api: {
        rooms: {
            attachLive,
        },
    },
}));

afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
});

describe("managed live-state guest eligibility", () => {
    it.each([
        [false, false, "guest"],
        [true, true, null],
    ] as const)(
        "reports guest play policy when allowGuestPlay is %s",
        (allowGuestPlay, playable, playBlockedReason) => {
            const player = {
                id: 1,
                name: "Guest",
                team: 0,
                admin: false,
            } as PlayerObject;
            const sessionStore = createPlayerSessionStore();
            sessionStore.set(player.id, {
                kind: "guest",
                playerId: "guest",
            });

            const snapshot = buildManagedLiveStateSnapshot({
                allowGuestPlay,
                documentProvider: undefined,
                desyncedPlayerIds: new Set(),
                getPlayerSession: sessionStore.get,
                liveStateContract: null,
                room: {
                    getGameStatus: () => "stopped",
                    getPlayerList: () => [player],
                    getScores: () => null,
                } as unknown as Room,
                roomName: "Test room",
                revision: 1,
            });

            expect(snapshot.players[0]).toMatchObject({
                playable,
                playBlockedReason,
                sessionKind: "guest",
            });
        },
    );
});

describe("managed live-state reconnection", () => {
    it("reconnects after the live socket closes", async () => {
        vi.useFakeTimers();
        const connection = createLiveRoomAttachment();
        attachLive.mockResolvedValue(connection);
        const module = createLiveStateModule();

        module.call("onRoomLink", createRoom(), "https://example.com");
        await Promise.resolve();

        const firstInput = attachLive.mock.calls[0]?.[0] as
            | AttachLiveRoomInput
            | undefined;

        expect(firstInput).toBeDefined();
        firstInput?.onAccepted?.();
        firstInput?.onClose?.();

        await vi.advanceTimersByTimeAsync(999);
        expect(attachLive).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(attachLive).toHaveBeenCalledTimes(2);
    });

    it("backs off repeated connection failures and resets after acceptance", async () => {
        vi.useFakeTimers();
        const connection = createLiveRoomAttachment();
        attachLive
            .mockRejectedValueOnce(new Error("first failure"))
            .mockRejectedValueOnce(new Error("second failure"))
            .mockResolvedValue(connection);
        const module = createLiveStateModule();
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);

        module.call("onRoomLink", createRoom(), "https://example.com");
        await Promise.resolve();
        await Promise.resolve();

        await vi.advanceTimersByTimeAsync(1_000);
        expect(attachLive).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(1_999);
        expect(attachLive).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(1);
        expect(attachLive).toHaveBeenCalledTimes(3);

        const acceptedInput = attachLive.mock.calls[2]?.[0] as
            | AttachLiveRoomInput
            | undefined;
        acceptedInput?.onAccepted?.();
        acceptedInput?.onClose?.();

        await vi.advanceTimersByTimeAsync(1_000);
        expect(attachLive).toHaveBeenCalledTimes(4);

        consoleError.mockRestore();
    });
});

function createLiveStateModule() {
    return createManagedLiveStateModule({
        allowGuestPlay: false,
        commId: "comm-1",
        getPlayerSession: () => null,
        roomId: "room-1",
        roomName: "Test room",
    });
}

function createLiveRoomAttachment(): LiveRoomAttachment {
    return {
        close: vi.fn<() => void>(),
        sendSnapshot: vi.fn<(snapshot?: unknown) => void>(),
        sendCommandResult: vi.fn<LiveRoomAttachment["sendCommandResult"]>(),
    };
}

function createRoom(): Room {
    return {
        getGameStatus: () => "stopped",
        getPlayerList: () => [],
        getScores: () => null,
    } as unknown as Room;
}
