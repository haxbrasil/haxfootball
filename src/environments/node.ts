import { HBInit } from "@haxbrasil/haxball-rs";
import { updateRoomModules } from "@core/module";
import { initI18n } from "@i18n";
import { env, roomId } from "@env/node";

async function bootstrap() {
    initI18n(env.LANGUAGE);

    const { getConfig, createModules } = await import("@room/manual");
    const modules = createModules({ roomId });

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
