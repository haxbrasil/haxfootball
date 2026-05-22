import { z } from "zod";
import { createEnv } from "./validator";

export const env = createEnv({
    schema: {
        PROXY: z.string().trim().min(1).optional(),
        DEBUG: z.stringbool().default(false),
        LANGUAGE: z.string().trim().min(1).optional(),
        TUTORIAL_LINK: z
            .string()
            .trim()
            .min(1)
            .default("youtube.com/watch?v=Z09dlI3MR28"),
        DISCORD_LINK: z.string().trim().min(1).default("discord.gg/q8ay8PmEkp"),
        PUBLIC_WEB_BASE_URL: z.string().trim().min(1).optional(),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
});
