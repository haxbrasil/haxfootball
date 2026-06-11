import type {
    PlayerJoinDataObject as HaxballRsPlayerJoinDataObject,
    PlayerJoinDataResponse as HaxballRsPlayerJoinDataResponse,
    PlayerObject as HaxballRsPlayerObject,
    RoomConfig,
    RoomDispatchOperation,
    RoomObject as HaxballRsRoomObject,
    RoomOperation,
    ScoresObject as HaxballRsScoresObject,
    TeamId,
} from "@haxbrasil/haxball-rs";

export {};

declare global {
    interface Window {
        HBInit(roomConfig: RoomConfigObject): RoomObject;
    }

    type TeamID = TeamId;

    type DefaultStadiums =
        | "Classic"
        | "Easy"
        | "Small"
        | "Big"
        | "Rounded"
        | "Hockey"
        | "BigHockey"
        | "BigEasy"
        | "BigRounded"
        | "Huge";

    type ChatSounds = 0 | 1 | 2;
    type ChatSoundString = "none" | "normal" | "notification";
    type ChatStyle =
        | "normal"
        | "bold"
        | "italic"
        | "small"
        | "small-bold"
        | "small-italic";

    interface Position {
        x: number;
        y: number;
    }

    type RoomGeoLocation = NonNullable<RoomConfig["geo"]>;
    type RoomConfigObject = RoomConfig;

    type PlayerObject = Omit<HaxballRsPlayerObject, "auth"> & {
        position: Position;
        conn: string;
        auth?: string | null;
        ip: string;
    };

    type PlayerJoinDataResponse = HaxballRsPlayerJoinDataResponse;
    type PlayerJoinDataObject = HaxballRsPlayerJoinDataObject;
    type RoomOperationObject = RoomOperation;
    type RoomOperationKind = RoomOperation["kind"];
    type RoomDispatchOperationObject = RoomDispatchOperation;

    type ScoresObject = HaxballRsScoresObject;

    type DiscPropertiesObject = {
        x?: number | null | undefined;
        y?: number | null | undefined;
        xspeed?: number | null | undefined;
        yspeed?: number | null | undefined;
        xgravity?: number | null | undefined;
        ygravity?: number | null | undefined;
        radius?: number | null | undefined;
        bCoeff?: number | null | undefined;
        invMass?: number | null | undefined;
        damping?: number | null | undefined;
        color?: number | null | undefined;
        cMask?: number | null | undefined;
        cGroup?: number | null | undefined;
    };

    type CollisionFlagsObject = {
        ball: number;
        red: number;
        blue: number;
        redKO: number;
        blueKO: number;
        wall: number;
        kick: number;
        score: number;
        c0: number;
        c1: number;
        c2: number;
        c3: number;
        all: number;
    };

    type RoomObject = Omit<
        HaxballRsRoomObject,
        | "CollisionFlags"
        | "getPlayer"
        | "getPlayerList"
        | "onPlayerJoin"
        | "onPlayerLeave"
        | "onPlayerChat"
        | "onPlayerBallKick"
        | "onGameStart"
        | "onGameStop"
        | "onPlayerAdminChange"
        | "onPlayerTeamChange"
        | "onPlayerKicked"
        | "onGamePause"
        | "onGameUnpause"
        | "onPlayerActivity"
        | "onStadiumChange"
        | "onKickRateLimitSet"
        | "onTeamsLockChange"
    > & {
        CollisionFlags: CollisionFlagsObject;
        getPlayer(playerId: number): PlayerObject | null;
        getPlayerList(): PlayerObject[];
        onPlayerJoin?: (player: PlayerObject) => void;
        onPlayerLeave?: (player: PlayerObject) => void;
        onPlayerChat?: (
            player: PlayerObject,
            message: string,
        ) => boolean | void;
        onPlayerBallKick?: (player: PlayerObject) => void;
        onGameStart?: (byPlayer: PlayerObject | null) => void;
        onGameStop?: (byPlayer: PlayerObject | null) => void;
        onPlayerAdminChange?: (
            changedPlayer: PlayerObject,
            byPlayer: PlayerObject | null,
        ) => void;
        onPlayerTeamChange?: (
            changedPlayer: PlayerObject,
            byPlayer: PlayerObject | null,
        ) => void;
        onPlayerKicked?: (
            kickedPlayer: PlayerObject,
            reason: string,
            ban: boolean,
            byPlayer: PlayerObject | null,
        ) => void;
        onGamePause?: (byPlayer: PlayerObject | null) => void;
        onGameUnpause?: (byPlayer: PlayerObject | null) => void;
        onPlayerActivity?: (player: PlayerObject) => void;
        onStadiumChange?: (
            newStadiumName: string | null,
            byPlayer: PlayerObject | null,
        ) => void;
        onKickRateLimitSet?: (
            min: number,
            rate: number,
            burst: number,
            byPlayer: PlayerObject | null,
        ) => void;
        onTeamsLockChange?: (
            locked: boolean,
            byPlayer: PlayerObject | null,
        ) => void;
    };
}
