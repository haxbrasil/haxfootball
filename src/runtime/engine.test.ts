import { describe, expect, it, vi } from "vitest";
import {
    createEngine,
    type GameState,
    type GameStatePlayer,
    type StateRegistry,
} from "./engine";
import { $effect, $tick } from "./runtime";
import { Team } from "@runtime/models";
import type { Room } from "@core/room";

type RoomStubOptions = {
    getPlayerList?: () => PlayerObject[];
    getBallPosition?: () => Position | null;
    getDiscProperties?: (discIndex: number) => DiscPropertiesObject | null;
    getPlayerDiscProperties?: (playerId: number) => DiscPropertiesObject | null;
    setPlayerDiscProperties?: (
        playerId: number,
        properties: DiscPropertiesObject,
    ) => void;
    stopGame?: () => void;
    invalidateCaches?: () => void;
};

type PlayerStub = {
    id: number;
    name: string;
    team: TeamID;
    position: Position | null;
    admin?: boolean;
    conn?: string;
    ip?: string;
};

function createRoomStub(options: RoomStubOptions = {}): Room {
    return {
        invalidateCaches: options.invalidateCaches ?? (() => { }),
        getPlayerList: options.getPlayerList ?? (() => []),
        getBallPosition: options.getBallPosition ?? (() => ({ x: 0, y: 0 })),
        getDiscProperties: options.getDiscProperties ?? (() => null),
        getPlayerDiscProperties:
            options.getPlayerDiscProperties ?? (() => null),
        setPlayerDiscProperties:
            options.setPlayerDiscProperties ?? (() => undefined),
        stopGame: options.stopGame ?? (() => undefined),
    } as unknown as Room;
}

function createPlayerStub({
    admin = false,
    conn = "",
    ip = "",
    ...player
}: PlayerStub): PlayerObject {
    return {
        admin,
        conn,
        ip,
        ...player,
    } as unknown as PlayerObject;
}

describe("createEngine", () => {
    it("does not advance state elapsed ticks while paused", () => {
        const recordElapsedTick = vi.fn<(tick: number) => void>();
        const registry: StateRegistry = {
            TEST: () => ({
                run(_state: GameState) {
                    recordElapsedTick($tick().current);
                },
            }),
        };
        const engine = createEngine(createRoomStub(), registry, {
            config: {},
        });

        engine.start("TEST");
        engine.tick();
        engine.handleGamePause(null);
        engine.tick();
        engine.tick();
        engine.handleGameUnpause(null);
        engine.tick();

        const elapsedTicks = recordElapsedTick.mock.calls.map(([tick]) => tick);

        expect(elapsedTicks).toEqual([0, 0, 0, 1]);
    });

    it("throws during a stable tick when a field player has no position", () => {
        const player = createPlayerStub({
            id: 4,
            name: "Dragon",
            team: Team.RED,
            position: null,
        });
        const registry: StateRegistry = {
            TEST: () => ({
                run() { },
            }),
        };
        const engine = createEngine(
            createRoomStub({
                getPlayerList: () => [player],
                getPlayerDiscProperties: () => null,
            }),
            registry,
            { config: {} },
        );

        engine.start("TEST");

        expect(() => engine.tick()).toThrow("Missing position for player 4");
    });

    it("uses the last stable player snapshot for leave when the player no longer has a position", () => {
        const leave = vi.fn<(player: GameStatePlayer) => void>();
        const stablePlayer = createPlayerStub({
            id: 4,
            name: "Dragon",
            team: Team.RED,
            position: { x: 10, y: 20 },
        });
        let players = [stablePlayer];
        let playerDisc: DiscPropertiesObject | null = {
            x: 10,
            y: 20,
            radius: 15,
        };
        const registry: StateRegistry = {
            TEST: () => ({
                run() { },
                leave,
            }),
        };
        const engine = createEngine(
            createRoomStub({
                getPlayerList: () => players,
                getPlayerDiscProperties: () => playerDisc,
            }),
            registry,
            { config: {} },
        );

        engine.start("TEST");
        engine.tick();

        players = [];
        playerDisc = null;

        engine.handlePlayerLeave(
            createPlayerStub({
                ...stablePlayer,
                position: null,
            }),
        );

        expect(leave).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 4,
                x: 10,
                y: 20,
                radius: 15,
            }),
        );
    });

    it("does not call leave for a spectator even if a previous field snapshot exists", () => {
        const leave = vi.fn<(player: GameStatePlayer) => void>();
        const fieldPlayer = createPlayerStub({
            id: 4,
            name: "Dragon",
            team: Team.RED,
            position: { x: 10, y: 20 },
        });
        const registry: StateRegistry = {
            TEST: () => ({
                run() { },
                leave,
            }),
        };
        const engine = createEngine(
            createRoomStub({
                getPlayerList: () => [fieldPlayer],
                getPlayerDiscProperties: () => ({
                    x: 10,
                    y: 20,
                    radius: 15,
                }),
            }),
            registry,
            { config: {} },
        );

        engine.start("TEST");
        engine.tick();

        engine.handlePlayerLeave(
            createPlayerStub({
                ...fieldPlayer,
                team: Team.SPECTATORS,
                position: null,
            }),
        );

        expect(leave).not.toHaveBeenCalled();
    });

    it("flushes queued player mutations before stopping the native game", () => {
        const calls: string[] = [];
        const player = createPlayerStub({
            id: 3,
            name: "Starco",
            team: Team.RED,
            position: { x: 10, y: 20 },
        });
        const registry: StateRegistry = {
            TEST: () => ({
                run() {
                    $effect(($) => {
                        $.setPlayerDiscProperties(3, {
                            xspeed: 0,
                            yspeed: 0,
                        });
                        $.stopGame();
                    });
                },
            }),
        };
        const engine = createEngine(
            createRoomStub({
                getPlayerList: () => [player],
                getPlayerDiscProperties: () => {
                    calls.push("get-player-disc");
                    return {
                        x: 10,
                        y: 20,
                        radius: 15,
                        xspeed: 1,
                        yspeed: 1,
                    };
                },
                setPlayerDiscProperties: () => {
                    calls.push("set-player-disc");
                },
                stopGame: () => {
                    calls.push("stop-game");
                },
            }),
            registry,
            { config: {} },
        );

        engine.start("TEST");
        engine.tick();

        expect(calls).toEqual([
            "get-player-disc",
            "get-player-disc",
            "set-player-disc",
            "stop-game",
        ]);
    });
});
