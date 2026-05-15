import { z } from "zod";
import { createEnv } from "./validator";

export const env = createEnv({
    schema: {
        TOKEN: z.string().trim().min(1),
        LANGUAGE: z.string().trim().min(1).optional(),
        __ROOM_ID: z.string().trim().min(1).optional(),
        ROOM_API_ROOM_ID: z.string().trim().min(1).optional(),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
});

export const roomId = env.__ROOM_ID ?? env.ROOM_API_ROOM_ID;
