import type { MatchEventInput } from "@haxbrasil/haxfootball-api-sdk";
import { api } from "@api/client";
import { COLOR } from "@common/general/color";
import { createModule, type Module } from "@core/module";
import type { Room } from "@core/room";
import { Team } from "@runtime/models";
import type {
    RuntimeMatchEvent,
    RuntimeMatchEventSink,
} from "@runtime/runtime";
import type {
    PlayerSessionReader,
    PlayerSessionStore,
} from "@room/shared/domain/player-sessions";
import type { GameScoreReader } from "@room/shared/domain/game-score";
import type { GameModeReader } from "@room/shared/domain/game-mode";
import { shouldPersistGameMode } from "@modes/registry";
import { createPublicWebUrl } from "@room/shared/domain/public-web-url";
import { ensureEventSchema } from "@room/managed/domain/event-schema";
import { GAME_MODE_NAME } from "@modes/classic/stats";
import { ReplayRecorder } from "@room/managed/domain/replay-recorder";
import {
    type MatchPlayerEventHook,
    projectMatchPlayerEvent,
} from "@room/managed/domain/match-player-events";
import { t } from "@lingui/core/macro";

const MIN_PERSISTED_MATCH_SECONDS = 30;
const CHECKPOINT_INTERVAL_SECONDS = 2;
const RECORDING_CHECKPOINT_INTERVAL_SECONDS = 10;
const TERMINAL_RETRY_DELAY_MS = 5_000;

type MatchScore = {
    red: number;
    blue: number;
    time: number;
};

type CheckpointEvent = MatchEventInput & {
    id: string;
    producerSequence: number;
};

type MatchStatus = "pending" | "ongoing" | "completed" | "discarded";

type MatchSession = {
    sessionId: string;
    startedAt: Date;
    endedAt: Date | null;
    matchId: string | null;
    lastScore: MatchScore | null;
    ended: boolean;
    creationQueued: boolean;
    checkpointRevision: number;
    recordingRevision: number;
    nextProducerSequence: number;
    lastCheckpointScheduledElapsed: number;
    lastRecordingScheduledElapsed: number;
    events: CheckpointEvent[];
    gameEvents: RuntimeMatchEvent[];
    playerIds: Map<number, string>;
    fieldParticipantRoomIds: Set<number>;
    replay: ReplayRecorder;
};

type CreateManagedMatchPersistenceOptions = {
    gameModeReader: GameModeReader;
    gameScoreReader: GameScoreReader;
    publicWebBaseUrl?: string | undefined;
    roomId?: string | undefined;
    sessionStore: PlayerSessionStore;
};

type MatchResponse = {
    id: string;
    recording: { url: string } | null;
};

type CheckpointResponse = {
    acknowledgedProducerSequence: number;
    match: MatchResponse;
};

export function createManagedMatchPersistence({
    gameModeReader,
    gameScoreReader,
    publicWebBaseUrl,
    roomId,
    sessionStore,
}: CreateManagedMatchPersistenceOptions): {
    module: Module;
    matchEvents: RuntimeMatchEventSink;
} {
    let session: MatchSession | null = null;
    let queue = Promise.resolve();

    const enqueue = (task: () => Promise<void>): void => {
        queue = queue.then(task).catch((error) => {
            console.error("Failed to persist match data:", error);
        });
    };

    const scheduleCheckpoint = (
        room: Room,
        currentSession: MatchSession,
        status?: MatchStatus,
    ): void => {
        enqueue(async () => {
            await ensureMatch(currentSession, roomId);
            await flushCheckpoint(
                room,
                currentSession,
                sessionStore.get,
                status,
            );
        });
    };

    const scheduleRecordingCheckpoint = (
        room: Room,
        currentSession: MatchSession,
        finalBytes?: Uint8Array | null,
    ): void => {
        enqueue(async () => {
            await ensureMatch(currentSession, roomId);
            const bytes = finalBytes ?? currentSession.replay.snapshot(room);

            if (bytes) {
                await uploadRecordingCheckpoint(currentSession, bytes);
            }
        });
    };

    const finishSession = (room: Room, currentSession: MatchSession): void => {
        if (session === currentSession) {
            session = null;
        }

        currentSession.ended = true;
        currentSession.endedAt ??= new Date();
        currentSession.lastScore = readScore(
            room,
            gameScoreReader,
            currentSession.lastScore,
        );
        const elapsedSeconds = getElapsedSeconds(currentSession);

        const persistFinishedSession = async (): Promise<void> => {
            await ensureMatch(currentSession, roomId);

            if (!currentSession.matchId) {
                scheduleTerminalRetry();
                return;
            }

            if (elapsedSeconds < MIN_PERSISTED_MATCH_SECONDS) {
                const discarded = await flushCheckpoint(
                    room,
                    currentSession,
                    sessionStore.get,
                    "discarded",
                );

                if (!discarded) {
                    scheduleTerminalRetry();
                }
                return;
            }

            const ongoing = await flushCheckpoint(
                room,
                currentSession,
                sessionStore.get,
                "ongoing",
            );

            if (!ongoing) {
                scheduleTerminalRetry();
                return;
            }

            const replayBytes = currentSession.replay.snapshot(room);

            if (replayBytes) {
                const uploaded = await uploadRecordingCheckpoint(
                    currentSession,
                    replayBytes,
                );

                if (!uploaded) {
                    scheduleTerminalRetry();
                    return;
                }
            }

            const response = await flushCheckpoint(
                room,
                currentSession,
                sessionStore.get,
                "completed",
            );

            if (response) {
                announceRecording(room, response.match, publicWebBaseUrl);
            } else {
                scheduleTerminalRetry();
            }
        };
        const scheduleTerminalRetry = (): void => {
            setTimeout(
                () => enqueue(persistFinishedSession),
                TERMINAL_RETRY_DELAY_MS,
            );
        };

        enqueue(persistFinishedSession);
    };

    const matchEvents: RuntimeMatchEventSink = (event) => {
        if (!session || session.ended) return;

        session.gameEvents.push(event);
        scheduleCheckpointForImportantEvent(session);
    };

    const module = createModule()
        .onGameStart((room) => {
            if (!shouldPersistGameMode(gameModeReader())) {
                session = null;
                return;
            }

            const currentSession: MatchSession = {
                sessionId: crypto.randomUUID(),
                startedAt: new Date(),
                endedAt: null,
                matchId: null,
                lastScore: readScore(room, gameScoreReader),
                ended: false,
                creationQueued: false,
                checkpointRevision: 0,
                recordingRevision: 0,
                nextProducerSequence: 1,
                lastCheckpointScheduledElapsed: Number.NEGATIVE_INFINITY,
                lastRecordingScheduledElapsed: Number.NEGATIVE_INFINITY,
                events: [],
                gameEvents: [],
                playerIds: new Map(),
                fieldParticipantRoomIds: new Set(),
                replay: new ReplayRecorder(),
            };

            session = currentSession;
            currentSession.replay.start(room);

            for (const player of room.getPlayerList()) {
                appendDispatchedMatchPlayerEvent(
                    currentSession,
                    "onPlayerJoin",
                    player,
                    sessionStore.get,
                );
            }

            scheduleCheckpoint(room, currentSession, "pending");
        })
        .onGameTick((room) => {
            const currentSession = session;
            if (!currentSession || currentSession.ended) return;

            currentSession.lastScore =
                readScore(room, gameScoreReader) ?? currentSession.lastScore;
            const elapsedSeconds = getElapsedSeconds(currentSession);
            const status =
                elapsedSeconds >= MIN_PERSISTED_MATCH_SECONDS
                    ? "ongoing"
                    : "pending";

            if (
                elapsedSeconds -
                    currentSession.lastCheckpointScheduledElapsed >=
                CHECKPOINT_INTERVAL_SECONDS
            ) {
                currentSession.lastCheckpointScheduledElapsed = elapsedSeconds;
                scheduleCheckpoint(room, currentSession, status);
            }

            if (
                elapsedSeconds >= MIN_PERSISTED_MATCH_SECONDS &&
                elapsedSeconds - currentSession.lastRecordingScheduledElapsed >=
                    RECORDING_CHECKPOINT_INTERVAL_SECONDS
            ) {
                currentSession.lastRecordingScheduledElapsed = elapsedSeconds;
                scheduleRecordingCheckpoint(room, currentSession);
            }
        })
        .onPlayerJoin((room, player) => {
            if (!session || session.ended) return;
            appendDispatchedMatchPlayerEvent(
                session,
                "onPlayerJoin",
                player,
                sessionStore.get,
            );
            session.lastScore =
                readScore(room, gameScoreReader) ?? session.lastScore;
            scheduleCheckpoint(room, session);
        })
        .onPlayerLeave((room, player) => {
            if (!session || session.ended) return;
            appendDispatchedMatchPlayerEvent(
                session,
                "onPlayerLeave",
                player,
                sessionStore.get,
            );
            session.lastScore =
                readScore(room, gameScoreReader) ?? session.lastScore;

            if (hasActivePlayers(room)) {
                scheduleCheckpoint(room, session);
                return;
            }

            finishSession(room, session);
        })
        .onPlayerTeamChange((room, player) => {
            if (!session || session.ended) return;
            appendDispatchedMatchPlayerEvent(
                session,
                "onPlayerTeamChange",
                player,
                sessionStore.get,
            );
            session.lastScore =
                readScore(room, gameScoreReader) ?? session.lastScore;
            scheduleCheckpoint(room, session);
        })
        .onGameStop((room) => {
            const currentSession = session;
            if (!currentSession) return;

            finishSession(room, currentSession);
        });

    function scheduleCheckpointForImportantEvent(
        currentSession: MatchSession,
    ): void {
        enqueue(async () => {
            await ensureMatch(currentSession, roomId);
            await flushCheckpoint(
                null,
                currentSession,
                sessionStore.get,
                undefined,
            );
        });
    }

    return { module, matchEvents };
}

async function ensureMatch(
    session: MatchSession,
    roomId: string | undefined,
): Promise<void> {
    if (session.matchId || session.creationQueued) return;

    session.creationQueued = true;

    try {
        const eventSchema = await ensureEventSchema();
        const result = await api.request<MatchResponse>({
            method: "POST",
            path: "/matches",
            body: {
                status: "pending",
                sessionId: session.sessionId,
                ...(roomId ? { roomId } : {}),
                gameMode: { name: GAME_MODE_NAME },
                initiatedAt: session.startedAt.toISOString(),
                ...(session.lastScore
                    ? {
                          score: {
                              red: session.lastScore.red,
                              blue: session.lastScore.blue,
                          },
                      }
                    : {}),
                ...(eventSchema ? { eventSchema } : {}),
            },
        });

        if (!result.ok) {
            console.error("Failed to create pending match:", result.error);
            return;
        }

        session.matchId = result.data.id;
    } finally {
        session.creationQueued = false;
    }
}

async function flushCheckpoint(
    room: Room | null,
    session: MatchSession,
    getPlayerSession: PlayerSessionReader,
    requestedStatus?: MatchStatus,
): Promise<CheckpointResponse | null> {
    if (!session.matchId || !session.lastScore) return null;

    materializeGameEvents(session, getPlayerSession);
    const events = [...session.events];
    const revision = ++session.checkpointRevision;
    const elapsedSeconds = getElapsedSeconds(session);
    const status =
        requestedStatus ??
        (elapsedSeconds >= MIN_PERSISTED_MATCH_SECONDS ? "ongoing" : "pending");
    const observedAt =
        status === "completed" || status === "discarded"
            ? (session.endedAt ?? new Date()).toISOString()
            : new Date().toISOString();
    const result = await api.request<CheckpointResponse>({
        method: "POST",
        path: `/matches/${encodeURIComponent(session.matchId)}/checkpoints`,
        body: {
            revision,
            observedAt,
            elapsedSeconds,
            score: {
                red: session.lastScore.red,
                blue: session.lastScore.blue,
            },
            events,
            status,
            ...(status === "completed" ? { completionReason: "normal" } : {}),
        },
    });

    if (!result.ok) {
        console.error("Failed to checkpoint match:", result.error);
        return null;
    }

    session.events = session.events.filter(
        (event) =>
            event.producerSequence > result.data.acknowledgedProducerSequence,
    );

    if (room) {
        session.lastScore =
            readScore(room, () => null, session.lastScore) ?? session.lastScore;
    }

    return result.data;
}

async function uploadRecordingCheckpoint(
    session: MatchSession,
    bytes: Uint8Array,
): Promise<boolean> {
    if (!session.matchId) return false;

    const revision = ++session.recordingRevision;
    const formData = new FormData();
    const copy = new Uint8Array(bytes.byteLength);

    copy.set(bytes);
    formData.set("revision", String(revision));
    formData.set(
        "file",
        new Blob([copy], { type: "application/octet-stream" }),
        `${session.matchId}-checkpoint.hbr2`,
    );

    const result = await api.request<{
        revision: number;
        sizeBytes: number;
    }>({
        method: "POST",
        path: `/matches/${encodeURIComponent(session.matchId)}/recording-checkpoint`,
        formData,
    });

    if (!result.ok) {
        console.error("Failed to upload recording checkpoint:", result.error);
        return false;
    }

    return true;
}

function materializeGameEvents(
    session: MatchSession,
    getPlayerSession: PlayerSessionReader,
): void {
    while (session.gameEvents.length > 0) {
        const rawEvent = session.gameEvents.shift();
        if (!rawEvent) break;

        const event = toMatchEventInput(session, rawEvent, getPlayerSession);
        if (event) {
            session.events.push(withProducerIdentity(session, event));
        }
    }
}

function appendDispatchedMatchPlayerEvent(
    session: MatchSession,
    hook: MatchPlayerEventHook,
    player: PlayerObject,
    getPlayerSession: PlayerSessionReader,
): void {
    const event = projectMatchPlayerEvent({
        hook,
        state: session,
        player,
        getPlayerSession,
        elapsedSeconds: elapsedSinceStart(session),
    });

    if (event) {
        session.events.push(withProducerIdentity(session, event));
    }
}

function withProducerIdentity(
    session: MatchSession,
    event: MatchEventInput,
): CheckpointEvent {
    return {
        ...event,
        id: crypto.randomUUID(),
        producerSequence: session.nextProducerSequence++,
    };
}

function toMatchEventInput(
    session: MatchSession,
    event: RuntimeMatchEvent,
    getPlayerSession: PlayerSessionReader,
): MatchEventInput | null {
    const backendPlayerId =
        getBackendPlayerId(event.playerId, getPlayerSession) ??
        session.playerIds.get(event.playerId);
    if (!backendPlayerId) return null;

    return {
        domain: "game",
        type: event.type,
        scope: "player",
        actorPlayerId: backendPlayerId,
        sourceState: event.sourceState,
        value: event.value,
        tick: event.tick,
    };
}

function getBackendPlayerId(
    roomPlayerId: number,
    getPlayerSession: PlayerSessionReader,
): string | null {
    const playerSession = getPlayerSession(roomPlayerId);

    if (
        playerSession?.kind === "signed-in" ||
        playerSession?.kind === "guest"
    ) {
        return playerSession.playerId;
    }

    return null;
}

function announceRecording(
    room: Room,
    match: MatchResponse,
    publicWebBaseUrl: string | undefined,
): void {
    if (!match.recording) return;

    const matchUrl =
        createPublicWebUrl(publicWebBaseUrl, ["matches", match.id]) ??
        match.recording.url;

    room.send({
        message: t`🎥 Match recorded: ${matchUrl}`,
        color: COLOR.SYSTEM,
        sound: "notification",
    });
}

function hasActivePlayers(room: Room): boolean {
    return room
        .getPlayerList()
        .some(
            (player) => player.team === Team.RED || player.team === Team.BLUE,
        );
}

function getElapsedSeconds(session: MatchSession): number {
    return session.lastScore?.time ?? elapsedSinceStart(session);
}

function elapsedSinceStart(session: MatchSession): number {
    return Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
}

function readScore(
    room: Room,
    gameScoreReader: GameScoreReader,
    previousScore: MatchScore | null = null,
): MatchScore | null {
    const gameScore = gameScoreReader();
    const nativeScores = room.getScores();

    if (gameScore) {
        return {
            red: gameScore.red,
            blue: gameScore.blue,
            time: nativeScores?.time ?? previousScore?.time ?? 0,
        };
    }

    if (nativeScores) {
        return {
            red: nativeScores.red,
            blue: nativeScores.blue,
            time: nativeScores.time,
        };
    }

    return previousScore;
}
