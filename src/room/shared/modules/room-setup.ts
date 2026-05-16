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
    });
}
