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
    it("does not stop the replay inside the game-stop callback", () => {
        const stopRecording = vi.fn<() => Uint8Array>(() =>
            Uint8Array.from([1, 2, 3]),
        );
        const room = createRoom({ time: 5, stopRecording });
        const persistence = createPersistence();

        persistence.module.call("onGameStart", room, null);
        persistence.module.call("onGameStop", room, null);

        expect(stopRecording).not.toHaveBeenCalled();
    });

    it("does not stop the replay inside the last-player-leave callback", () => {
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

    it("checkpoints and completes an eligible match with its recording", async () => {
        installSuccessfulRequests();
        const snapshotRecording = vi.fn<() => Uint8Array>(() =>
            Uint8Array.from([1, 2, 3]),
        );
        const room = createRoom({ time: 31, snapshotRecording });
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
        expect(snapshotRecording).toHaveBeenCalledOnce();
    });
});

function createPersistence() {
    return createManagedMatchPersistence({
        gameModeReader: () => "classic",
        gameScoreReader: () => ({ red: 6, blue: 7 }),
        roomId: "room-1",
        sessionStore: createPlayerSessionStore(),
    });
}

function createRoom({
    time,
    snapshotRecording = vi.fn<() => Uint8Array>(() => Uint8Array.from([1, 2])),
    stopRecording = vi.fn<() => Uint8Array>(() => Uint8Array.from([1, 2, 3])),
}: {
    time: number;
    snapshotRecording?: () => Uint8Array;
    stopRecording?: () => Uint8Array;
}): Room {
    return {
        getPlayerList: () => [],
        getScores: () => ({
            red: 6,
            blue: 7,
            time,
            scoreLimit: 0,
            timeLimit: 0,
        }),
        send: vi.fn<() => void>(),
        startRecording: vi.fn<() => boolean>(() => true),
        snapshotRecording,
        stopRecording,
    } as unknown as Room;
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
