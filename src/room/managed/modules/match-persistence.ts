import type {
    AddMatchEventInput,
    CreateMatchInput,
    MatchEventInput,
    Recording,
} from "@haxbrasil/haxfootball-api-sdk";
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
    gameEvents: RuntimeMatchEvent[];
    playerIds: Map<number, string>;
    fieldParticipantRoomIds: Set<number>;
    replay: ReplayRecorder;
};

type CreateManagedMatchPersistenceOptions = {
    gameModeReader: GameModeReader;
    gameScoreReader: GameScoreReader;
    publicWebBaseUrl?: string | undefined;
    sessionStore: PlayerSessionStore;
};

export function createManagedMatchPersistence({
    gameModeReader,
    gameScoreReader,
    publicWebBaseUrl,
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
        const replayBytes = currentSession.replay.stop(room);

        if (elapsedSeconds < MIN_PERSISTED_MATCH_SECONDS) {
            return;
        }

        currentSession.matchCreationStarted = true;
        enqueue(async () => {
            await createMatch(currentSession);

            try {
                await flushBufferedData(currentSession, sessionStore.get);
            } finally {
                await completeMatch(
                    room,
                    currentSession,
                    replayBytes,
                    publicWebBaseUrl,
                );
            }
        });
    };

    const matchEvents: RuntimeMatchEventSink = (event) => {
        if (!session || session.ended) return;

        session.gameEvents.push(event);
        if (!session.matchId) return;

        const currentSession = session;
        enqueue(async () => {
            await flushBufferedData(currentSession, sessionStore.get);
        });
    };

    const module = createModule()
        .onGameStart((room) => {
            if (!shouldPersistGameMode(gameModeReader())) {
                session = null;
                return;
            }

            session = {
                startedAt: new Date(),
                endedAt: null,
                matchId: null,
                lastScore: readScore(room, gameScoreReader),
                matchCreationStarted: false,
                ended: false,
                events: [],
                gameEvents: [],
                playerIds: new Map(),
                fieldParticipantRoomIds: new Set(),
                replay: new ReplayRecorder(),
            };

            session.replay.start(room);

            for (const player of room.getPlayerList()) {
                appendDispatchedMatchPlayerEvent(
                    session,
                    "onPlayerJoin",
                    player,
                    sessionStore.get,
                );
            }
        })
        .onGameTick((room) => {
            if (session) {
                session.lastScore =
                    readScore(room, gameScoreReader) ?? session.lastScore;
                persistIfEligible(session);
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
            persistIfEligible(session);
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
                persistIfEligible(session);
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
            persistIfEligible(session);
        })
        .onGameStop((room) => {
            const currentSession = session;
            if (!currentSession) return;

            finishSession(room, currentSession);
        });

    return { module, matchEvents };
}

async function createMatch(session: MatchSession): Promise<void> {
    if (session.matchId) return;

    const eventSchema = await ensureEventSchema();
    const eventCount = session.events.length;
    const events = session.events.slice(0, eventCount);
    const body: CreateMatchInput = {
        status: "ongoing",
        gameMode: {
            name: GAME_MODE_NAME,
        },
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
        ...(eventSchema
            ? {
                  eventSchema,
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

    while (session.events.length > 0) {
        const event = session.events[0];
        if (!event) break;

        const result = await api.matches.addEvent(session.matchId, event);
        if (!result.ok) {
            console.error("Failed to add match event:", result.error);
            break;
        }

        session.events.shift();
    }

    while (session.gameEvents.length > 0) {
        const rawGameEvent = session.gameEvents[0];
        if (!rawGameEvent) break;

        const event = toMatchEventInput(
            session,
            rawGameEvent,
            getPlayerSession,
        );
        if (!event) {
            session.gameEvents.shift();
            continue;
        }

        const result = await api.matches.addEvent(session.matchId, event);
        if (!result.ok) {
            console.error("Failed to add match event:", result.error);
            break;
        }

        session.gameEvents.shift();
    }
}

async function completeMatch(
    room: Room,
    session: MatchSession,
    replayBytes: Uint8Array | null,
    publicWebBaseUrl: string | undefined,
): Promise<void> {
    if (!session.matchId) return;
    if (!session.endedAt) return;

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
        return;
    }

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
            const matchUrl =
                createPublicWebUrl(publicWebBaseUrl, [
                    "matches",
                    session.matchId,
                ]) ?? recording.url;

            room.send({
                message: t`🎥 Match recorded: ${matchUrl}`,
                color: COLOR.SYSTEM,
                sound: "notification",
            });
        }
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
        session.events.push(event);
    }
}

function toMatchEventInput(
    session: MatchSession,
    event: RuntimeMatchEvent,
    getPlayerSession: PlayerSessionReader,
): AddMatchEventInput | null {
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
    const session = getPlayerSession(roomPlayerId);

    if (session?.kind === "signed-in" || session?.kind === "guest") {
        return session.playerId;
    }

    return null;
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

    if (!gameScore && !nativeScores) return previousScore;

    return {
        red: gameScore?.red ?? previousScore?.red ?? 0,
        blue: gameScore?.blue ?? previousScore?.blue ?? 0,
        time: nativeScores?.time ?? previousScore?.time ?? 0,
    };
}
