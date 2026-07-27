import { afterEach, describe, expect, it, vi } from "vitest";
import type { Room } from "@core/room";
import { Team } from "@runtime/models";
import { createPlayerSessionStore } from "@room/shared/domain/player-sessions";
import { createManagedMatchPersistence } from "./match-persistence";

const ensureEventSchema = vi.hoisted(() => vi.fn<() => Promise<null>>());
const createMatch = vi.hoisted(() =>
    vi.fn<(body: unknown) => Promise<{ ok: true; data: { id: string } }>>(),
);
const addEvent = vi.hoisted(() =>
    vi.fn<
        (
            id: string,
            event: unknown,
        ) => Promise<{ ok: true; data: { id: string } }>
    >(),
);
const updateMatch = vi.hoisted(() =>
    vi.fn<
        (
            id: string,
            body: unknown,
        ) => Promise<{ ok: true; data: { id: string } }>
    >(),
);
const associateRecording = vi.hoisted(() =>
    vi.fn<
        (
            id: string,
            body: unknown,
        ) => Promise<{ ok: true; data: { id: string } }>
    >(),
);
const createRecording = vi.hoisted(() =>
    vi.fn<
        (body: unknown) => Promise<{
            ok: true;
            data: { id: string; url: string };
        }>
    >(),
);

vi.mock("@room/managed/domain/event-schema", () => ({
    ensureEventSchema,
}));

vi.mock("@api/client", () => ({
    api: {
        matches: {
            create: createMatch,
            addEvent,
            update: updateMatch,
            associateRecording,
        },
        recordings: {
            create: createRecording,
        },
    },
}));

afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
});

describe("managed match persistence callback safety", () => {
    it("stops the replay before the game-stop callback returns", () => {
        const stopRecording = vi.fn<() => Uint8Array>(() =>
            Uint8Array.from([1, 2, 3]),
        );
        const room = {
            getPlayerList: () => [],
            getScores: () => ({
                red: 0,
                blue: 0,
                time: 5,
                scoreLimit: 0,
                timeLimit: 0,
            }),
            send: vi.fn<() => void>(),
            startRecording: vi.fn<() => boolean>(() => true),
            stopRecording,
        } as unknown as Room;
        const persistence = createManagedMatchPersistence({
            gameModeReader: () => "classic",
            gameScoreReader: () => ({ red: 0, blue: 0 }),
            sessionStore: createPlayerSessionStore(),
        });

        persistence.module.call("onGameStart", room, null);
        persistence.module.call("onGameStop", room, null);

        expect(stopRecording).toHaveBeenCalledOnce();
    });

    it("stops the replay before the last-player-leave callback returns", () => {
        const stopRecording = vi.fn<() => Uint8Array>(() =>
            Uint8Array.from([1, 2, 3]),
        );
        const player = {
            id: 1,
            name: "Player",
            team: Team.RED,
            admin: false,
        } as PlayerObject;
        const room = {
            getPlayerList: () => [],
            getScores: () => ({
                red: 0,
                blue: 0,
                time: 5,
                scoreLimit: 0,
                timeLimit: 0,
            }),
            send: vi.fn<() => void>(),
            startRecording: vi.fn<() => boolean>(() => true),
            stopRecording,
        } as unknown as Room;
        const persistence = createManagedMatchPersistence({
            gameModeReader: () => "classic",
            gameScoreReader: () => ({ red: 0, blue: 0 }),
            sessionStore: createPlayerSessionStore(),
        });

        persistence.module.call("onGameStart", room, null);
        persistence.module.call("onPlayerLeave", room, player);

        expect(stopRecording).toHaveBeenCalledOnce();
    });

    it("persists the final score and recording after leaving the callback", async () => {
        ensureEventSchema.mockResolvedValue(null);
        createMatch.mockResolvedValue({
            ok: true,
            data: { id: "match-1" },
        });
        updateMatch.mockResolvedValue({
            ok: true,
            data: { id: "match-1" },
        });
        createRecording.mockResolvedValue({
            ok: true,
            data: {
                id: "recording-1",
                url: "https://example.com/recording-1",
            },
        });
        associateRecording.mockResolvedValue({
            ok: true,
            data: { id: "match-1" },
        });
        const stopRecording = vi.fn<() => Uint8Array>(() =>
            Uint8Array.from([1, 2, 3]),
        );
        const room = {
            getPlayerList: () => [],
            getScores: () => ({
                red: 6,
                blue: 7,
                time: 31,
                scoreLimit: 0,
                timeLimit: 0,
            }),
            send: vi.fn<() => void>(),
            startRecording: vi.fn<() => boolean>(() => true),
            stopRecording,
        } as unknown as Room;
        const persistence = createManagedMatchPersistence({
            gameModeReader: () => "classic",
            gameScoreReader: () => ({ red: 6, blue: 7 }),
            sessionStore: createPlayerSessionStore(),
        });

        persistence.module.call("onGameStart", room, null);
        persistence.module.call("onGameStop", room, null);

        expect(createMatch).not.toHaveBeenCalled();

        await vi.waitFor(() => {
            expect(associateRecording).toHaveBeenCalledOnce();
        });

        expect(updateMatch).toHaveBeenCalledWith("match-1", {
            status: "completed",
            endedAt: expect.any(String),
            score: {
                red: 6,
                blue: 7,
            },
        });
        expect(createRecording).toHaveBeenCalledOnce();
        expect(associateRecording).toHaveBeenCalledWith("match-1", {
            recordingId: "recording-1",
        });
    });
});
