import { HBInit } from "@haxbrasil/haxball-rs";
import { createModule, updateRoomModules } from "@core/module";
import { api } from "@api/client";
import { env, type RoomServerEnvironment } from "@env/room-server";
import { initI18n } from "@i18n";
import { IncidentRecorder } from "@room/shared/domain/incidents";
import {
    createRoomIncidentReporter,
    type RoomIncidentReporter,
} from "@room/managed/modules/incidents";

const incidentRecorder = new IncidentRecorder({
    ...(env.incidentBuffer.seconds
        ? { windowMs: env.incidentBuffer.seconds * 1_000 }
        : {}),
    ...(env.incidentBuffer.maxRecords
        ? { maxRecords: env.incidentBuffer.maxRecords }
        : {}),
});

const incidentReporter = createRoomIncidentReporter({
    commId: env.apiReadiness?.commId,
    recorder: incidentRecorder,
    roomId: env.apiReadiness?.roomId,
});

installCrashIncidentHandlers(incidentReporter);

async function bootstrap() {
    initI18n(env.language);

    const { getConfig, createModules } = await import("@room/managed");

    const modules = createModules({
        incidentReporter,
        publicWebBaseUrl: env.publicWebBaseUrl,
        roomId: env.apiReadiness?.roomId,
    });

    const room = HBInit(createRoomConfig(env, getConfig()));

    updateRoomModules(
        room,
        [
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
        ],
        {
            incidents: incidentRecorder,
        },
    );
}

bootstrap().catch((error) => {
    console.error("Failed to bootstrap room-server environment:", error);
    void incidentReporter
        .flushCrash(
            "uncaught-exception",
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error),
        )
        .catch((uploadError) => {
            console.error("Failed to upload bootstrap incident:", uploadError);
        })
        .finally(() => {
            process.exitCode = 1;
            process.exit(1);
        });
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
        ...(roomProperties.geo
            ? {
                  geo: {
                      code: roomProperties.geo.code,
                      lat: roomProperties.geo.lat,
                      lon: roomProperties.geo.lon,
                  },
              }
            : {}),
        ...(environment.proxy ? { proxy: environment.proxy } : {}),
    };
}

function installCrashIncidentHandlers(reporter: RoomIncidentReporter): void {
    const flush = async (
        kind: "uncaught-exception" | "unhandled-rejection",
        error: unknown,
    ) => {
        try {
            await Promise.race([
                reporter.flushCrash(
                    kind,
                    error instanceof Error
                        ? `${error.name}: ${error.message}`
                        : String(error),
                ),
                new Promise((resolve) => setTimeout(resolve, 2_000)),
            ]);
        } catch (uploadError) {
            console.error("Failed to upload crash incident:", uploadError);
        }
    };

    process.on("uncaughtException", (error) => {
        console.error("Uncaught room error:", error);
        void flush("uncaught-exception", error).finally(() => {
            process.exitCode = 1;
            process.exit(1);
        });
    });

    process.on("unhandledRejection", (reason) => {
        console.error("Unhandled room rejection:", reason);
        void flush("unhandled-rejection", reason).finally(() => {
            process.exitCode = 1;
            process.exit(1);
        });
    });
}
