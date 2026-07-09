import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Module } from "@core/module";
import type { Room } from "@core/room";
import { Team } from "@runtime/models";
import { createPlayerSessionStore } from "@room/shared/domain/player-sessions";

let createAuthenticationController: typeof import("./authentication").createAuthenticationController;

beforeAll(async () => {
    vi.stubEnv("TUTORIAL_LINK", "https://example.com/tutorial");
    vi.stubEnv("DISCORD_LINK", "https://example.com/discord");
    ({ createAuthenticationController } = await import("./authentication"));
});

afterAll(() => {
    vi.unstubAllEnvs();
});

describe("authentication field eligibility", () => {
    it.each([
        ["blocks", false, false],
        ["allows", true, true],
    ] as const)(
        "%s guest field moves when configured",
        (_name, allowGuestPlay, expected) => {
            const { module, sessionStore, room, player } =
                setup(allowGuestPlay);
            sessionStore.set(player.id, { kind: "guest", playerId: "guest" });

            const result = module.call(
                "onBeforeOperation",
                room,
                operation("player-team", player, {
                    playerId: player.id,
                    team: Team.RED,
                }),
            );

            expect(result).toBe(expected);
        },
    );

    it.each([
        ["blocks", false, false],
        ["allows", true, true],
    ] as const)(
        "%s guests in auto-teams when configured",
        (_name, allowGuestPlay, expected) => {
            const { module, sessionStore, room, player } =
                setup(allowGuestPlay);
            sessionStore.set(player.id, { kind: "guest", playerId: "guest" });

            const result = module.call(
                "onBeforeOperation",
                room,
                operation("auto-teams", player),
            );

            expect(result).toBe(expected);
        },
    );

    it("still blocks unresolved players when guest play is enabled", () => {
        const { module, sessionStore, room, player } = setup(true);
        sessionStore.set(player.id, {
            kind: "resolving",
            token: Symbol("resolving"),
        });

        const result = module.call(
            "onBeforeOperation",
            room,
            operation("player-team", player, {
                playerId: player.id,
                team: Team.RED,
            }),
        );

        expect(result).toBe(false);
    });
});

function setup(allowGuestPlay: boolean) {
    const sessionStore = createPlayerSessionStore();
    const player = createPlayer(1, "Guest");
    const send = vi.fn<(payload: unknown) => void>();
    const room = { send } as unknown as Room;
    const { module } = createAuthenticationController({
        allowGuestPlay,
        downstreamModules: [] as Module[],
        sessionStore,
    });

    return { module, player, room, send, sessionStore };
}

function createPlayer(id: number, name: string): PlayerObject {
    return {
        id,
        name,
        team: Team.SPECTATORS,
        admin: false,
        auth: "",
        conn: "",
        ip: "",
    } as PlayerObject;
}

function operation(
    kind: "player-team" | "auto-teams",
    target: PlayerObject,
    message: Record<string, unknown> = {},
): RoomOperationObject {
    return {
        kind,
        rawType: 0,
        byPlayer: null,
        targetPlayers: [target],
        message,
    } as RoomOperationObject;
}
