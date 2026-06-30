import { describe, expect, it } from "vitest";
import { createRoomConfig } from "./room-server-config";
import type { RoomServerEnvironment } from "@env/room-server";

describe("createRoomConfig", () => {
    it("uses explicit managed room environment fields", () => {
        const config = createRoomConfig(
            environment({
                roomName: "BFL Test",
                roomPublic: false,
                maxPlayers: 20,
                roomPassword: "secret",
                noPlayer: true,
                geo: {
                    code: "BR",
                    lat: -23.5,
                    lon: -46.6,
                },
                proxy: "http://127.0.0.1:8888",
            }),
            {
                roomName: "Base",
                maxPlayers: 25,
                public: true,
                noPlayer: false,
            },
        );

        expect(config).toMatchObject({
            roomName: "BFL Test",
            maxPlayers: 20,
            public: false,
            noPlayer: true,
            password: "secret",
            geo: {
                code: "BR",
                lat: -23.5,
                lon: -46.6,
            },
            proxy: "http://127.0.0.1:8888",
            token: "token",
        });
    });

    it("omits optional password, geo, and proxy when they are absent", () => {
        const config = createRoomConfig(environment(), {
            roomName: "Base",
            maxPlayers: 25,
            public: true,
            noPlayer: false,
        });

        expect(config).toMatchObject({
            roomName: "HaxFootball",
            maxPlayers: 25,
            public: true,
            noPlayer: true,
            token: "token",
        });
        expect(config).not.toHaveProperty("password");
        expect(config).not.toHaveProperty("geo");
        expect(config).not.toHaveProperty("proxy");
    });
});

function environment(
    overrides: Partial<RoomServerEnvironment> = {},
): RoomServerEnvironment {
    return {
        roomName: "HaxFootball",
        roomPublic: true,
        maxPlayers: 25,
        noPlayer: true,
        roomToken: "token",
        incidentBuffer: {},
        incidentLevel: "normal",
        ...overrides,
    } as RoomServerEnvironment;
}
