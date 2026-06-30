import { HBInit } from "@haxbrasil/haxball-rs";
import { createModule, updateRoomModules } from "@core/module";
import { initI18n } from "@i18n";
import { env, roomId } from "@env/node";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { IncidentRecorder } from "@room/shared/domain/incidents";

const incidentRecorder = new IncidentRecorder();

async function bootstrap() {
    initI18n(env.LANGUAGE);

    const { getConfig, createModules } = await import("@room/manual");
    const modules = [
        ...createModules({ roomId }),
        createModule().onPlayerSyncChange(async (room, player, desynced) => {
            if (!desynced) return;

            try {
                const payload = incidentRecorder.captureIncident("desync", {
                    playerId: player.id,
                    players: room.getPlayerList().map(({ id, name }) => ({
                        id,
                        name,
                    })),
                });
                const directory = resolve(env.HAXFOOTBALL_LOCAL_INCIDENT_DIR);
                const filename = `desync-${payload.occurredAt.replace(
                    /[:.]/g,
                    "-",
                )}-player-${player.id}.json`;
                const filePath = resolve(directory, filename);

                await mkdir(directory, { recursive: true });
                await writeFile(
                    filePath,
                    `${JSON.stringify(payload, null, 2)}\n`,
                );
                console.error(`Local desync incident dumped: ${filePath}`);
            } catch (error) {
                console.error("Failed to dump local desync incident:", error);
            }
        }),
    ];

    const room = HBInit({
        ...getConfig(),
        token: env.TOKEN,
    });

    updateRoomModules(room, modules, {
        incidents: incidentRecorder,
        incidentLevel: "full",
    });
}

bootstrap().catch((error) => {
    console.error("Failed to bootstrap headless environment:", error);
    process.exitCode = 1;
});
