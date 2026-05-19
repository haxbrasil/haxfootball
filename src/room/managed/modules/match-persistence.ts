import type {
    AddMatchStatEventInput,
    CreateMatchInput,
    MatchEventInput,
    Recording,
} from "@haxbrasil/haxfootball-api-sdk";
import { api } from "@api/client";
import { COLOR } from "@common/general/color";
import { createModule, type Module } from "@core/module";
import type { Room } from "@core/room";
import { Team } from "@runtime/models";
import type { RuntimeStatEvent, RuntimeStatEventSink } from "@runtime/runtime";
import type {
    PlayerSessionReader,
    PlayerSessionStore,
} from "@room/shared/domain/player-sessions";
import { ensureStatEventSchema } from "@room/managed/domain/stat-event-schema";
import { StreamingReplayRecorder } from "@room/managed/domain/streaming-replay-recorder";

const MIN_PERSISTED_MATCH_SECONDS = 30;

type MatchScore = {
    red: number;
    blue: number;
    time: number;
};

type MatchSession = {
    startedAt: Date;
    endedAt: Date | null;
    matchId: string | null;
    lastScore: MatchScore | null;
    matchCreationStarted: boolean;
    ended: boolean;
    events: MatchEventInput[];
    stats: RuntimeStatEvent[];
    playerIds: Map<number, string>;
    replay: StreamingReplayRecorder;
};

type CreateManagedMatchPersistenceOptions = {
    sessionStore: PlayerSessionStore;
};

export function createManagedMatchPersistence({
    sessionStore,
}: CreateManagedMatchPersistenceOptions): {
    module: Module;
    statEvents: RuntimeStatEventSink;
} {
    let session: MatchSession | null = null;
    let queue = Promise.resolve();

    const enqueue = (task: () => Promise<void>): void => {
        queue = queue.then(task).catch((error) => {
            console.error("Failed to persist match data:", error);
        });
    };

    const persistIfEligible = (currentSession: MatchSession): void => {
        if (currentSession.matchId || currentSession.matchCreationStarted) {
            return;
        }
        if (getElapsedSeconds(currentSession) < MIN_PERSISTED_MATCH_SECONDS) {
            return;
        }

        currentSession.matchCreationStarted = true;
        enqueue(async () => {
            await createMatch(currentSession);
            await flushBufferedData(currentSession, sessionStore.get);
        });
    };

    const statEvents: RuntimeStatEventSink = (event) => {
        if (!session || session.ended) return;

        session.stats.push(event);
        if (!session.matchId) return;

        const currentSession = session;
        enqueue(async () => {
            await flushBufferedData(currentSession, sessionStore.get);
        });
    };

    const module = createModule()
        .onGameStart((room) => {
            session = {
                startedAt: new Date(),
                endedAt: null,
                matchId: null,
                lastScore: readScore(room),
                matchCreationStarted: false,
                ended: false,
                events: [],
                stats: [],
                playerIds: new Map(),
                replay: new StreamingReplayRecorder(),
            };

            session.replay.start(room);

            for (const player of room.getPlayerList()) {
                appendPlayerEvent(
                    session,
                    "player_join",
                    player,
                    sessionStore.get,
                );
            }
        })
        .onBeforeOperation((_room, operation) => {
            session?.replay.recordOperation(operation);
        })
        .onGameTick((room) => {
            if (session) {
                session.lastScore = readScore(room) ?? session.lastScore;
                persistIfEligible(session);
            }
        })
        .onPlayerJoin((room, player) => {
            if (!session || session.ended) return;
            appendPlayerEvent(session, "player_join", player, sessionStore.get);
            session.lastScore = readScore(room) ?? session.lastScore;
            persistIfEligible(session);
        })
        .onPlayerLeave((room, player) => {
            if (!session || session.ended) return;
            appendPlayerEvent(
                session,
                "player_leave",
                player,
                sessionStore.get,
            );
            session.lastScore = readScore(room) ?? session.lastScore;
            persistIfEligible(session);
        })
        .onPlayerTeamChange((room, player) => {
            if (!session || session.ended) return;
            appendPlayerEvent(
                session,
                "player_team_change",
                player,
                sessionStore.get,
            );
            session.lastScore = readScore(room) ?? session.lastScore;
            persistIfEligible(session);
        })
        .onGameStop((room) => {
            const currentSession = session;
            if (!currentSession) return;

            session = null;
            currentSession.ended = true;
            currentSession.endedAt = new Date();
            currentSession.lastScore =
                readScore(room) ?? currentSession.lastScore;
            const elapsedSeconds = getElapsedSeconds(currentSession);
            const replayBytes = currentSession.replay.stop(room);

            if (elapsedSeconds < MIN_PERSISTED_MATCH_SECONDS) {
                return;
            }

            currentSession.matchCreationStarted = true;
            enqueue(async () => {
                await createMatch(currentSession);
                await flushBufferedData(currentSession, sessionStore.get);
                await completeMatch(room, currentSession, replayBytes);
            });
        });

    return { module, statEvents };
}

async function createMatch(session: MatchSession): Promise<void> {
    if (session.matchId) return;

    const statEventSchema = await ensureStatEventSchema();
    const eventCount = session.events.length;
    const events = session.events.slice(0, eventCount);
    const body: CreateMatchInput = {
        status: session.ended ? "completed" : "ongoing",
        initiatedAt: session.startedAt.toISOString(),
        events,
        ...(session.lastScore
            ? {
                  score: {
                      red: session.lastScore.red,
                      blue: session.lastScore.blue,
                  },
              }
            : {}),
        ...(session.endedAt ? { endedAt: session.endedAt.toISOString() } : {}),
        ...(statEventSchema
            ? {
                  statEventSchema,
              }
            : {}),
    };

    const result = await api.matches.create(body);
    if (!result.ok) {
        console.error("Failed to create match:", result.error);
        return;
    }

    session.matchId = result.data.id;
    session.events.splice(0, eventCount);
}

async function flushBufferedData(
    session: MatchSession,
    getPlayerSession: PlayerSessionReader,
): Promise<void> {
    if (!session.matchId) return;

    const eventCount = session.events.length;
    const events = session.events.slice(0, eventCount);
    if (events.length > 0) {
        const result = await api.matches.appendEvents(session.matchId, {
            events,
        });
        if (!result.ok) {
            console.error("Failed to append match events:", result.error);
        } else {
            session.events.splice(0, eventCount);
        }
    }

    while (session.stats.length > 0) {
        const rawStatEvent = session.stats[0];
        if (!rawStatEvent) break;

        const statEvent = toStatEventInput(
            session,
            rawStatEvent,
            getPlayerSession,
        );
        if (!statEvent) {
            session.stats.shift();
            continue;
        }

        const result = await api.matches.addStatEvent(
            session.matchId,
            statEvent,
        );
        if (!result.ok) {
            console.error("Failed to add match stat event:", result.error);
            break;
        }

        session.stats.shift();
    }
}

async function completeMatch(
    room: Room,
    session: MatchSession,
    replayBytes: Uint8Array | null,
): Promise<void> {
    if (!session.matchId) return;
    if (!session.endedAt) return;

    const recording = replayBytes
        ? await uploadRecording(session.matchId, replayBytes)
        : null;

    if (recording) {
        const association = await api.matches.associateRecording(
            session.matchId,
            {
                recordingId: recording.id,
            },
        );

        if (!association.ok) {
            console.error("Failed to associate recording:", association.error);
        } else {
            room.send({
                message: `🎥 Match recorded: ${recording.url}`,
                color: COLOR.SYSTEM,
                sound: "notification",
            });
        }
    }

    const result = await api.matches.update(session.matchId, {
        status: "completed",
        endedAt: session.endedAt.toISOString(),
        ...(session.lastScore
            ? {
                  score: {
                      red: session.lastScore.red,
                      blue: session.lastScore.blue,
                  },
              }
            : {}),
    });

    if (!result.ok) {
        console.error("Failed to complete match:", result.error);
    }
}

async function uploadRecording(
    matchId: string,
    replayBytes: Uint8Array,
): Promise<Recording | null> {
    const result = await api.recordings.create({
        file: replayBytes,
        filename: `${matchId}.hbr2`,
    });

    if (!result.ok) {
        console.error("Failed to upload recording:", result.error);
        return null;
    }

    return result.data;
}

function appendPlayerEvent(
    session: MatchSession,
    type: MatchEventInput["type"],
    player: PlayerObject,
    getPlayerSession: PlayerSessionReader,
): void {
    const backendPlayerId =
        getBackendPlayerId(player.id, getPlayerSession) ??
        session.playerIds.get(player.id);

    if (!backendPlayerId) return;
    if (type !== "player_leave") {
        session.playerIds.set(player.id, backendPlayerId);
    }

    session.events.push({
        type,
        playerId: backendPlayerId,
        roomPlayerId: player.id,
        team: toApiTeam(player.team),
        occurredAt: new Date().toISOString(),
        elapsedSeconds: elapsedSinceStart(session),
    });
}

function toStatEventInput(
    session: MatchSession,
    event: RuntimeStatEvent,
    getPlayerSession: PlayerSessionReader,
): AddMatchStatEventInput | null {
    const backendPlayerId =
        getBackendPlayerId(event.playerId, getPlayerSession) ??
        session.playerIds.get(event.playerId);
    if (!backendPlayerId) return null;

    return {
        type: event.type,
        playerId: backendPlayerId,
        value: event.value,
        tick: event.tick,
    };
}

function getBackendPlayerId(
    roomPlayerId: number,
    getPlayerSession: PlayerSessionReader,
): string | null {
    const session = getPlayerSession(roomPlayerId);

    if (session?.kind === "signed-in" || session?.kind === "guest") {
        return session.playerId;
    }

    return null;
}

function toApiTeam(team: number): NonNullable<MatchEventInput["team"]> {
    if (team === Team.RED) return "red";
    if (team === Team.BLUE) return "blue";
    return "spectators";
}

function getElapsedSeconds(session: MatchSession): number {
    return session.lastScore?.time ?? elapsedSinceStart(session);
}

function elapsedSinceStart(session: MatchSession): number {
    return Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
}

function readScore(room: Room): MatchScore | null {
    const scores = room.getScores();
    if (!scores) return null;

    return {
        red: scores.red,
        blue: scores.blue,
        time: scores.time,
    };
}
