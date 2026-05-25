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
import type { GameScoreReader } from "@room/shared/domain/game-score";
import type { GameModeReader } from "@room/shared/domain/game-mode";
import { shouldPersistGameMode } from "@meta/registry";
import { createPublicWebUrl } from "@room/shared/domain/public-web-url";
import { ensureStatEventSchema } from "@room/managed/domain/stat-event-schema";
import { GAME_MODE_NAME } from "@meta/legacy/stats";
import { ReplayRecorder } from "@room/managed/domain/replay-recorder";
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
    stats: RuntimeStatEvent[];
    playerIds: Map<number, string>;
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
                stats: [],
                playerIds: new Map(),
                replay: new ReplayRecorder(),
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
        .onGameTick((room) => {
            if (session) {
                session.lastScore =
                    readScore(room, gameScoreReader) ?? session.lastScore;
                persistIfEligible(session);
            }
        })
        .onPlayerJoin((room, player) => {
            if (!session || session.ended) return;
            appendPlayerEvent(session, "player_join", player, sessionStore.get);
            session.lastScore =
                readScore(room, gameScoreReader) ?? session.lastScore;
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
            appendPlayerEvent(
                session,
                "player_team_change",
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

    return { module, statEvents };
}

async function createMatch(session: MatchSession): Promise<void> {
    if (session.matchId) return;

    const statEventSchema = await ensureStatEventSchema();
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

    const event: MatchEventInput = {
        type,
        playerId: backendPlayerId,
        roomPlayerId: player.id,
        occurredAt: new Date().toISOString(),
        elapsedSeconds: elapsedSinceStart(session),
    };

    if (type !== "player_leave") {
        event.team = toApiTeam(player.team);
    }

    session.events.push(event);
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
