import Haxball from "@haxball/game";
import { updateRoomModules } from "@core/module";
import { initI18n } from "@i18n";
import { env } from "@env/node";

async function bootstrap() {
    initI18n(env.LANGUAGE);

    const { getConfig, modules } = await import("@room/manual");

    const HBInit: Function = await Haxball;
    const room = HBInit({
        ...getConfig(),
        token: env.TOKEN,
    });

    updateRoomModules(room, modules);
}

bootstrap().catch((error) => {
    console.error("Failed to bootstrap headless environment:", error);
    process.exitCode = 1;
});
