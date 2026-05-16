import { createModule, type Module } from "@core/module";

export function createChatLoggingModule(): Module {
    return createModule().onPlayerChat((_, player, message) => {
        const time = new Date().toLocaleTimeString();
        console.log(`[${time}] ${player.name}: ${message}`);
    });
}
