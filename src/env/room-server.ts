import { z } from "zod";
import { createEnv } from "./validator";

const roomServerPropertiesSchema = z.object({
    name: z.string(),
    geo: z
        .object({
            code: z.string(),
            lat: z.number(),
            lon: z.number(),
        })
        .optional(),
    max_player_count: z.number(),
    show_in_room_list: z.boolean(),
    password: z.string().nullable().optional(),
    no_player: z.boolean(),
    algorithmic_room_management_enabled: z.boolean().optional(),
    algorithmic_room_management_afk_activity_detection_enabled: z
        .boolean()
        .optional(),
});

const roomServerEnvSchema = {
    ROOM_PROPERTIES_JSON: z.preprocess((value) => {
        if (typeof value !== "string") {
            return value;
        }

        try {
            return JSON.parse(value) as unknown;
        } catch {
            return value;
        }
    }, roomServerPropertiesSchema),
    ROOM_TOKEN: z.string().default(""),
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
    __ROOM_ID: z.string().trim().min(1).optional(),
    ROOM_API_ROOM_ID: z.string().trim().min(1).optional(),
    __ROOM_COMM_ID: z.string().trim().min(1).optional(),
    ROOM_COMM_ID: z.string().trim().min(1).optional(),
    HAXFOOTBALL_INCIDENT_BUFFER_SECONDS: z.coerce
        .number()
        .int()
        .positive()
        .optional(),
    HAXFOOTBALL_INCIDENT_BUFFER_MAX_RECORDS: z.coerce
        .number()
        .int()
        .positive()
        .optional(),
    HAXFOOTBALL_INCIDENT_LEVEL: z.enum(["normal", "full"]).default("normal"),
} satisfies z.ZodRawShape;

export const env = createEnv(
    {
        schema: roomServerEnvSchema,
        runtimeEnv: process.env,
        emptyStringAsUndefined: true,
    },
    (rawEnv) => {
        const roomId = rawEnv.__ROOM_ID ?? rawEnv.ROOM_API_ROOM_ID;
        const commId = rawEnv.__ROOM_COMM_ID ?? rawEnv.ROOM_COMM_ID;

        return {
            roomProperties: rawEnv.ROOM_PROPERTIES_JSON,
            roomToken: rawEnv.ROOM_TOKEN,
            ...(rawEnv.PROXY ? { proxy: rawEnv.PROXY } : {}),
            ...(rawEnv.LANGUAGE ? { language: rawEnv.LANGUAGE } : {}),
            ...(rawEnv.PUBLIC_WEB_BASE_URL
                ? { publicWebBaseUrl: rawEnv.PUBLIC_WEB_BASE_URL }
                : {}),
            ...(roomId && commId ? { apiReadiness: { roomId, commId } } : {}),
            incidentBuffer: {
                seconds: rawEnv.HAXFOOTBALL_INCIDENT_BUFFER_SECONDS,
                maxRecords: rawEnv.HAXFOOTBALL_INCIDENT_BUFFER_MAX_RECORDS,
            },
            incidentLevel: rawEnv.HAXFOOTBALL_INCIDENT_LEVEL,
            roomManagerEnabled:
                rawEnv.ROOM_PROPERTIES_JSON.algorithmic_room_management_enabled,
            roomManagerAfkActivityDetectionEnabled:
                rawEnv.ROOM_PROPERTIES_JSON
                    .algorithmic_room_management_afk_activity_detection_enabled,
        };
    },
);

export type RoomServerEnvironment = typeof env;
export type RoomServerProperties = RoomServerEnvironment["roomProperties"];
export type RoomApiReadinessEnvironment = NonNullable<
    RoomServerEnvironment["apiReadiness"]
>;
