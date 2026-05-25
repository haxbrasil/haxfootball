import type {
    CommandDefinition,
    CommandResponse,
    CommandSpec,
} from "@core/commands";
import type { Room } from "@core/room";
import type { StadiumObject } from "@haxball/stadium";
import type { Engine, EngineOptions, StateRegistry } from "@runtime/engine";
import type { RuntimeStatEventSink } from "@runtime/runtime";
import type { GameScoreStore } from "@room/shared/domain/game-score";
import type { RoomAuthorization } from "@room/shared/domain/authorization";
import { GAME_MODE, type GameModeName } from "./game-mode";

export { GAME_MODE };
export type { GameModeName };

export type GameMetaStart = {
    state: string;
    params: Record<string, unknown>;
};

export type GameMetaCommandContext = {
    authorization: RoomAuthorization;
    command: CommandSpec;
    engine: Engine<unknown> | null;
    player: PlayerObject;
    room: Room;
};

export type GameMetaStopContext = {
    engine: Engine<unknown> | null;
    gameScoreStore?: GameScoreStore;
    room: Room;
};

export type GameMetaRuntime = {
    commands: CommandDefinition[];
    createEngineOptions(args: {
        statEvents?: RuntimeStatEventSink;
    }): EngineOptions<unknown>;
    handleCommand(ctx: GameMetaCommandContext): CommandResponse | null;
    syncGameScore(
        engine: Engine<unknown> | null,
        gameScoreStore?: GameScoreStore,
    ): void;
    handleGameStop(ctx: GameMetaStopContext): void;
};

export type GameMetaDefinition = {
    name: GameModeName;
    label: string;
    stadium: StadiumObject;
    registry: StateRegistry;
    start: GameMetaStart;
    room: {
        scoreLimit: number;
        timeLimit: number;
    };
    persistsMatches: boolean;
    createRuntime(): GameMetaRuntime;
};
