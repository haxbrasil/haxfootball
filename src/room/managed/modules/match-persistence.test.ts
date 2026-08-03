import { afterEach, describe, expect, it, vi } from "vitest";
import type { Room } from "@core/room";
import { Team } from "@runtime/models";
import { createPlayerSessionStore } from "@room/shared/domain/player-sessions";
import { createManagedMatchPersistence } from "./match-persistence";

const ensureEventSchema = vi.hoisted(() => vi.fn<() => Promise<null>>());
const request = vi.hoisted(() =>
    vi.fn<
        (input: {
            path: string;
            body?: Record<string, unknown>;
            [key: string]: unknown;
        }) => Promise<{ ok: true; data: unknown }>
    >(),
);

vi.mock("@room/managed/domain/event-schema", () => ({
    ensureEventSchema,
}));

vi.mock("@api/client", () => ({
    api: { request },
}));

afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
});

describe("managed match persistence callback safety", () => {
    it("does not stop the replay inside the game-stop callback", async () => {
        installSuccessfulRequests();
        const stopRecording = vi.fn<() => Uint8Array>(() =>
            Uint8Array.from([1, 2, 3]),
        );
        const room = createRoom({ time: 5, stopRecording });
        const persistence = createPersistence();

        persistence.module.call("onGameStart", room, null);
        persistence.module.call("onGameStop", room, null);

        expect(stopRecording).not.toHaveBeenCalled();
        await vi.waitFor(() => {
            expect(checkpointBodies()).toContainEqual(
                expect.objectContaining({ status: "discarded" }),
            );
        });
    });

    it("does not stop the replay inside the last-player-leave callback", async () => {
        installSuccessfulRequests();
        const stopRecording = vi.fn<() => Uint8Array>(() =>
            Uint8Array.from([1, 2, 3]),
        );
        const player = {
            id: 1,
            name: "Player",
            team: Team.RED,
            admin: false,
        } as PlayerObject;
        const room = createRoom({ time: 5, stopRecording });
        const persistence = createPersistence();

        persistence.module.call("onGameStart", room, null);
        persistence.module.call("onPlayerLeave", room, player);

        expect(stopRecording).not.toHaveBeenCalled();
        await vi.waitFor(() => {
            expect(checkpointBodies()).toContainEqual(
                expect.objectContaining({ status: "discarded" }),
            );
        });
    });

    it("creates a pending match immediately and discards a short game", async () => {
        installSuccessfulRequests();
        const room = createRoom({ time: 5 });
        const persistence = createPersistence();

        persistence.module.call("onGameStart", room, null);
        persistence.module.call("onGameStop", room, null);

        await vi.waitFor(() => {
            expect(checkpointBodies()).toContainEqual(
                expect.objectContaining({ status: "discarded" }),
            );
        });

        expect(request).toHaveBeenCalledWith(
            expect.objectContaining({
                method: "POST",
                path: "/matches",
                body: expect.objectContaining({
                    status: "pending",
                    roomId: "room-1",
                }),
            }),
        );
        expect(recordingCheckpointRequests()).toHaveLength(0);
    });

    it("persists a delayed short-game checkpoint from its own snapshot", async () => {
        ensureEventSchema.mockResolvedValue(null);
        const creationReleased = deferred<void>();
        request.mockImplementation(
            async ({
                path,
                body,
            }: {
                path: string;
                body?: Record<string, unknown>;
            }) => {
                if (path === "/matches") {
                    await creationReleased.promise;
                    return {
                        ok: true,
                        data: { id: "match-1", recording: null },
                    };
                }

                if (path.endsWith("/checkpoints")) {
                    const events = (body?.["events"] ?? []) as Array<{
                        producerSequence: number;
                    }>;
                    const lastEvent = events[events.length - 1];

                    return {
                        ok: true,
                        data: {
                            acknowledgedProducerSequence:
                                lastEvent?.producerSequence ?? 0,
                            match: { id: "match-1", recording: null },
                        },
                    };
                }

                return {
                    ok: true,
                    data: { revision: 1, sizeBytes: 3 },
                };
            },
        );

        const room = createRoom({ time: 10 });
        const persistence = createPersistence();

        persistence.module.call("onGameStart", room, null);
        persistence.matchEvents({
            type: "test-event",
            playerId: 1,
            sourceState: "test",
            value: {},
            tick: 1,
        });
        persistence.module.call("onGameStop", room, null);

        room.setTime(37);
        creationReleased.resolve();

        await vi.waitFor(() => {
            expect(checkpointBodies()).toContainEqual(
                expect.objectContaining({ status: "discarded" }),
            );
        });

        expect(checkpointBodies()).not.toContainEqual(
            expect.objectContaining({ status: "ongoing" }),
        );
        expect(checkpointBodies()).not.toContainEqual(
            expect.objectContaining({ elapsedSeconds: 37 }),
        );
        expect(
            checkpointBodies().filter(({ status }) => status === "discarded"),
        ).toHaveLength(1);
    });

    it("checkpoints and completes an eligible match with its recording", async () => {
        installSuccessfulRequests();
        const snapshotRecordingAsync = vi.fn<() => Promise<Uint8Array>>(
            async () => Uint8Array.from([1, 2, 3]),
        );
        const room = createRoom({ time: 31, snapshotRecordingAsync });
        const persistence = createPersistence();

        persistence.module.call("onGameStart", room, null);
        persistence.module.call("onGameStop", room, null);

        await vi.waitFor(() => {
            expect(checkpointBodies()).toContainEqual(
                expect.objectContaining({
                    status: "completed",
                    completionReason: "normal",
                    score: { red: 6, blue: 7 },
                }),
            );
        });

        expect(recordingCheckpointRequests()).toHaveLength(1);
        expect(snapshotRecordingAsync).toHaveBeenCalledOnce();
    });

    it("completes a short registered game at the configured threshold", async () => {
        installSuccessfulRequests();
        const room = createRoom({ time: 5 });
        const persistence = createPersistence({
            minimumPersistedMatchSeconds: 4,
        });

        persistence.module.call("onGameStart", room, null);
        persistence.module.call("onGameStop", room, null);

        await vi.waitFor(() => {
            expect(checkpointBodies()).toContainEqual(
                expect.objectContaining({
                    status: "completed",
                    score: { red: 6, blue: 7 },
                }),
            );
        });
    });
});

function createPersistence(
    options: { minimumPersistedMatchSeconds?: number } = {},
) {
    return createManagedMatchPersistence({
        gameModeReader: () => "classic",
        gameScoreReader: () => ({ red: 6, blue: 7 }),
        roomId: "room-1",
        sessionStore: createPlayerSessionStore(),
        ...options,
    });
}

function deferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
} {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((nextResolve) => {
        resolve = nextResolve;
    });

    return { promise, resolve };
}

function createRoom({
    time,
    snapshotRecordingAsync = vi.fn<() => Promise<Uint8Array>>(async () =>
        Uint8Array.from([1, 2]),
    ),
    stopRecording = vi.fn<() => Uint8Array>(() => Uint8Array.from([1, 2, 3])),
}: {
    time: number;
    snapshotRecordingAsync?: () => Promise<Uint8Array>;
    stopRecording?: () => Uint8Array;
}): Room & { setTime: (time: number) => void } {
    let currentTime = time;

    return {
        getPlayerList: () => [],
        getScores: () => ({
            red: 6,
            blue: 7,
            time: currentTime,
            scoreLimit: 0,
            timeLimit: 0,
        }),
        send: vi.fn<() => void>(),
        startRecording: vi.fn<() => boolean>(() => true),
        snapshotRecordingAsync,
        stopRecording,
        setTime: (time: number) => {
            currentTime = time;
        },
    } as unknown as Room & { setTime: (time: number) => void };
}

function installSuccessfulRequests(): void {
    ensureEventSchema.mockResolvedValue(null);
    request.mockImplementation(
        async ({
            path,
            body,
        }: {
            path: string;
            body?: Record<string, unknown>;
        }) => {
            if (path === "/matches") {
                return {
                    ok: true,
                    data: { id: "match-1", recording: null },
                };
            }

            if (path.endsWith("/checkpoints")) {
                const events = (body?.["events"] ?? []) as Array<{
                    producerSequence: number;
                }>;
                const lastEvent = events[events.length - 1];

                return {
                    ok: true,
                    data: {
                        acknowledgedProducerSequence:
                            lastEvent?.producerSequence ?? 0,
                        match: {
                            id: "match-1",
                            recording:
                                body?.["status"] === "completed"
                                    ? {
                                          url: "https://example.com/recording",
                                      }
                                    : null,
                        },
                    },
                };
            }

            return {
                ok: true,
                data: { revision: 1, sizeBytes: 3 },
            };
        },
    );
}

function checkpointBodies(): Array<Record<string, unknown>> {
    return request.mock.calls
        .map(([input]) => input)
        .filter(({ path }) => path.endsWith("/checkpoints"))
        .flatMap(({ body }) => (body ? [body] : []));
}

function recordingCheckpointRequests(): unknown[] {
    return request.mock.calls
        .map(([input]) => input)
        .filter(({ path }) => path.endsWith("/recording-checkpoint"));
}
