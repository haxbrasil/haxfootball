import { z } from "zod";
import { createEnv } from "./validator";

export const env = createEnv({
    schema: {
        TOKEN: z.string().trim().min(1),
        LANGUAGE: z.string().trim().min(1).optional(),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
});
