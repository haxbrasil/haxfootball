import { createModule, type Module } from "@core/module";
import { env } from "@env/room";

export function createRoomSetupModule(): Module {
    return createModule().onRoomLink((room, url) => {
        if (env.DEBUG) {
            console.warn("Running in debug mode.");
        }

        console.log(`Room link: ${url}`);

        room.lockTeams();
        room.setScoreLimit(0);
        room.setTimeLimit(10);

        if (env.HAXBALL_RS_DESYNC_CHECKER_ENABLED !== undefined) {
            room.setDesyncCheckerEnabled(env.HAXBALL_RS_DESYNC_CHECKER_ENABLED);
        }

        if (env.HAXBALL_RS_DESYNC_CHECKER_INTERVAL_TICKS !== undefined) {
            room.setDesyncCheckerIntervalTicks(
                env.HAXBALL_RS_DESYNC_CHECKER_INTERVAL_TICKS,
            );
        }
    });
}
