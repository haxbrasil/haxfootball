import Haxball from "@haxball/game";
import { createModule, updateRoomModules } from "@core/module";
import { api } from "@api/client";
import { env, type RoomServerEnvironment } from "@env/room-server";
import { initI18n } from "@i18n";

async function bootstrap() {
    initI18n(env.language);

    const { getConfig, createModules } = await import("@room/manual");
    const modules = createModules({
        roomId: env.apiReadiness?.roomId,
    });

    const HBInit: Function = await Haxball;
    const room = HBInit(createRoomConfig(env, getConfig()));

    updateRoomModules(room, [
        ...modules,
        createModule().onRoomLink(async (_room, url) => {
            if (!env.apiReadiness) {
                return;
            }

            try {
                const result = await api.rooms.reportReady(
                    env.apiReadiness.roomId,
                    {
                        commId: env.apiReadiness.commId,
                        roomLink: url,
                    },
                );

                if (!result.ok) {
                    throw result.error;
                }
            } catch (error) {
                console.error("Failed to report room ready:", error);
            }
        }),
    ]);
}

bootstrap().catch((error) => {
    console.error("Failed to bootstrap room-server environment:", error);
    process.exitCode = 1;
});

function createRoomConfig(
    environment: RoomServerEnvironment,
    baseConfig: RoomConfigObject,
): RoomConfigObject {
    const { roomProperties } = environment;

    return {
        ...baseConfig,
        roomName: roomProperties.name,
        maxPlayers: roomProperties.max_player_count,
        public: roomProperties.show_in_room_list,
        noPlayer: roomProperties.no_player,
        token: environment.roomToken,
        ...(roomProperties.password
            ? { password: roomProperties.password }
            : {}),
        geo: {
            code: roomProperties.geo.code,
            lat: roomProperties.geo.lat,
            lon: roomProperties.geo.lon,
        },
        ...(environment.proxy ? { proxy: environment.proxy } : {}),
    };
}
