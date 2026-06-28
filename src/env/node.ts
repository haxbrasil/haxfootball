import { z } from "zod";
import { createEnv } from "./validator";

export const env = createEnv({
    schema: {
        TOKEN: z.string().trim().min(1),
        LANGUAGE: z.string().trim().min(1).optional(),
        HAXFOOTBALL_LOCAL_INCIDENT_DIR: z
            .string()
            .trim()
            .min(1)
            .default(".local-incidents"),
        __ROOM_ID: z.string().trim().min(1).optional(),
        ROOM_API_ROOM_ID: z.string().trim().min(1).optional(),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
});

export const roomId = env.__ROOM_ID ?? env.ROOM_API_ROOM_ID;
