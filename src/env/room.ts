import { z } from "zod";
import { createEnv } from "./validator";

export const env = createEnv({
    schema: {
        PROXY: z.string().trim().min(1).optional(),
        DEBUG: z.stringbool().default(false),
        ROOM_MANAGER_ENABLED: z.stringbool().optional(),
        ROOM_MANAGER_AFK_ACTIVITY_DETECTION_ENABLED: z.stringbool().optional(),
        LANGUAGE: z.string().trim().min(1).optional(),
        TUTORIAL_LINK: z.string().trim().min(1),
        DISCORD_LINK: z.string().trim().min(1),
        PUBLIC_WEB_BASE_URL: z.string().trim().min(1).optional(),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
});
