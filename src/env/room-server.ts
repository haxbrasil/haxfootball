import { z } from "zod";
import { createEnv } from "./validator";

const roomServerBaseEnvSchema = {
    ROOM_NAME: z.string().trim().min(1),
    ROOM_PUBLIC: z.stringbool(),
    MAX_PLAYERS: z.coerce.number().int().min(1).max(30),
    ROOM_PASSWORD: z.string().trim().min(1).optional(),
    NO_PLAYER: z.stringbool(),
    ROOM_TOKEN: z.string().default(""),
    PROXY: z.string().trim().min(1).optional(),
    DEBUG: z.stringbool().default(false),
    ROOM_MANAGER_ENABLED: z.stringbool().optional(),
    ROOM_MANAGER_AFK_ACTIVITY_DETECTION_ENABLED: z.stringbool().optional(),
    ROOM_ALLOW_GUEST_PLAY: z.stringbool().optional(),
    ROOM_AUTO_MANAGE_NATIVE_ADMINS: z.stringbool().optional(),
    LANGUAGE: z.string().trim().min(1).optional(),
    TUTORIAL_LINK: z.string().trim().min(1),
    DISCORD_LINK: z.string().trim().min(1),
    PUBLIC_WEB_BASE_URL: z.string().trim().min(1).optional(),
    __ROOM_ID: z.string().trim().min(1).optional(),
    ROOM_API_ROOM_ID: z.string().trim().min(1).optional(),
    __ROOM_COMM_ID: z.string().trim().min(1).optional(),
    ROOM_COMM_ID: z.string().trim().min(1).optional(),
    __ROOM_API_URL: z.string().trim().min(1).optional(),
    ROOM_API_URL: z.string().trim().min(1).optional(),
    __ROOM_API_JWT: z.string().trim().min(1).optional(),
    ROOM_API_JWT: z.string().trim().min(1).optional(),
    ROOM_LIVE_STATE_CONTRACT_JSON: z.string().trim().min(1).optional(),
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

const roomServerEnvSchema = z.object(roomServerBaseEnvSchema).and(
    z.union([
        z.object({
            GEO_CODE: z.string().trim().min(1),
            GEO_LAT: z.coerce.number(),
            GEO_LON: z.coerce.number(),
        }),
        z.object({
            GEO_CODE: z.undefined().optional(),
            GEO_LAT: z.undefined().optional(),
            GEO_LON: z.undefined().optional(),
        }),
    ]),
);

export const env = createEnv(
    {
        schema: roomServerEnvSchema,
        runtimeEnv: process.env,
        emptyStringAsUndefined: true,
    },
    (rawEnv) => {
        const roomId = rawEnv.__ROOM_ID ?? rawEnv.ROOM_API_ROOM_ID;
        const commId = rawEnv.__ROOM_COMM_ID ?? rawEnv.ROOM_COMM_ID;
        const apiUrl = rawEnv.__ROOM_API_URL ?? rawEnv.ROOM_API_URL;
        const apiJwt = rawEnv.__ROOM_API_JWT ?? rawEnv.ROOM_API_JWT;

        return {
            roomName: rawEnv.ROOM_NAME,
            roomPublic: rawEnv.ROOM_PUBLIC,
            maxPlayers: rawEnv.MAX_PLAYERS,
            roomPassword: rawEnv.ROOM_PASSWORD,
            noPlayer: rawEnv.NO_PLAYER,
            ...(rawEnv.GEO_CODE
                ? {
                      geo: {
                          code: rawEnv.GEO_CODE,
                          lat: rawEnv.GEO_LAT,
                          lon: rawEnv.GEO_LON,
                      },
                  }
                : {}),
            roomToken: rawEnv.ROOM_TOKEN,
            ...(rawEnv.PROXY ? { proxy: rawEnv.PROXY } : {}),
            ...(rawEnv.LANGUAGE ? { language: rawEnv.LANGUAGE } : {}),
            ...(rawEnv.PUBLIC_WEB_BASE_URL
                ? { publicWebBaseUrl: rawEnv.PUBLIC_WEB_BASE_URL }
                : {}),
            ...(roomId && commId && apiUrl && apiJwt
                ? { apiReadiness: { roomId, commId, apiUrl, apiJwt } }
                : {}),
            liveStateContractJson: rawEnv.ROOM_LIVE_STATE_CONTRACT_JSON,
            incidentBuffer: {
                seconds: rawEnv.HAXFOOTBALL_INCIDENT_BUFFER_SECONDS,
                maxRecords: rawEnv.HAXFOOTBALL_INCIDENT_BUFFER_MAX_RECORDS,
            },
            incidentLevel: rawEnv.HAXFOOTBALL_INCIDENT_LEVEL,
            roomManagerEnabled: rawEnv.ROOM_MANAGER_ENABLED,
            roomManagerAfkActivityDetectionEnabled:
                rawEnv.ROOM_MANAGER_AFK_ACTIVITY_DETECTION_ENABLED,
            allowGuestPlay: rawEnv.ROOM_ALLOW_GUEST_PLAY,
            autoManageNativeAdmins: rawEnv.ROOM_AUTO_MANAGE_NATIVE_ADMINS,
        };
    },
);

export type RoomServerEnvironment = typeof env;
export type RoomApiReadinessEnvironment = NonNullable<
    RoomServerEnvironment["apiReadiness"]
>;
