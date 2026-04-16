import Haxball from "@haxball/game";
import { updateRoomModules } from "@core/module";
import { initI18n } from "@i18n";

type RoomProperties = {
    name: string;
    geo: { code: string; lat: number; lon: number };
    max_player_count: number;
    show_in_room_list: boolean;
    password?: string | null;
    no_player: boolean;
};

function parseRoomProperties(): RoomProperties {
    const raw = process.env["ROOM_PROPERTIES_JSON"];

    if (!raw) {
        throw new Error("ROOM_PROPERTIES_JSON is not set");
    }

    return JSON.parse(raw) as RoomProperties;
}

function sendInvite(invite: string): void {
    process.send?.({ type: "invite", invite });
}

function sendOpenFailed(code: string, message?: string): void {
    process.send?.({ type: "open_failed", code, message });
}

async function bootstrap() {
    const properties = parseRoomProperties();
    const token = process.env["ROOM_TOKEN"] ?? "";
    const proxy = process.env["PROXY"];
    const language = process.env["LANGUAGE"];

    initI18n(language);

    const { getConfig, modules } = await import("@room/manual");
    const baseConfig = getConfig();

    const config: RoomConfigObject = {
        ...baseConfig,
        roomName: properties.name,
        maxPlayers: properties.max_player_count,
        public: properties.show_in_room_list,
        noPlayer: properties.no_player,
        token,
        ...(properties.password ? { password: properties.password } : {}),
        ...(properties.geo
            ? {
                  geo: {
                      code: properties.geo.code,
                      lat: properties.geo.lat,
                      lon: properties.geo.lon,
                  },
              }
            : {}),
        ...(proxy ? { proxy } : {}),
    };

    const HBInit: Function = await Haxball;
    const room = HBInit(config);

    updateRoomModules(room, modules);

    const originalOnRoomLink = room.onRoomLink;
    room.onRoomLink = (url: string) => {
        sendInvite(url);
        originalOnRoomLink?.(url);
    };
}

bootstrap().catch((error) => {
    const message =
        error instanceof Error ? error.message : "Unknown bootstrap error";
    sendOpenFailed("bootstrap_failed", message);
    console.error("Failed to bootstrap room-server environment:", error);
    process.exitCode = 1;
});
