import type {
    CommandDefinition,
    CommandResponse,
    CommandSpec,
} from "@core/commands";
import type { ScoreState } from "@common/game/game";
import type { Room } from "@core/room";
import type { StadiumObject } from "@haxball/stadium";
import type { Engine, EngineOptions, StateRegistry } from "@runtime/engine";
import type { RuntimeMatchEventSink } from "@runtime/runtime";
import type { GameScoreStore } from "@room/shared/domain/game-score";
import type { RoomAuthorization } from "@room/shared/domain/authorization";
import { GAME_MODE, type GameModeName } from "./game-mode";
import type { FieldTeam } from "@runtime/models";

export { GAME_MODE };
export type { GameModeName };

export type GameModeStart = {
    state: string;
    params: Record<string, unknown>;
};

export type GameModeCommandContext = {
    authorization: RoomAuthorization;
    command: CommandSpec;
    engine: Engine<unknown> | null;
    player: PlayerObject;
    room: Room;
};

export type GameModeStopContext = {
    engine: Engine<unknown> | null;
    gameScoreStore?: GameScoreStore;
    room: Room;
};

export type GameModeTickEndContext = {
    engine: Engine<unknown> | null;
    gameScoreStore?: GameScoreStore;
    room: Room;
};

export type GameModeCompletedResult = {
    status: "complete";
    expectedTimeReached: boolean;
    overage: boolean;
    winnerTeam: FieldTeam;
    loserTeam: FieldTeam;
    finalScore: ScoreState;
    reason: string;
    elapsedSeconds: number;
};

export type GameModeRuntime = {
    commands: CommandDefinition[];
    createEngineOptions(args: {
        matchEvents?: RuntimeMatchEventSink;
    }): EngineOptions<unknown>;
    handleCommand(ctx: GameModeCommandContext): CommandResponse | null;
    syncGameScore(
        engine: Engine<unknown> | null,
        gameScoreStore?: GameScoreStore,
    ): void;
    getCompletedResult(): GameModeCompletedResult | null;
    handleGameTickEnd?(ctx: GameModeTickEndContext): void;
    handleGameStop(ctx: GameModeStopContext): void;
};

export type GameModeDefinition = {
    name: GameModeName;
    label: string;
    stadium: StadiumObject;
    registry: StateRegistry;
    start: GameModeStart;
    room: {
        scoreLimit: number;
        timeLimit: number;
    };
    persistsMatches: boolean;
    createRuntime(): GameModeRuntime;
};
