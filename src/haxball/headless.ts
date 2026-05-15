export {};

declare global {
    interface Window {
        /**
         * Use this function to initialize the room, it returns the room object used to control the room.
         *
         * After calling this function a recaptcha challenge will appear, after passing the recaptcha the room link will appear on the page.
         *
         * @example
         *
         * var room = HBInit({
         *  roomName: "My room",
         *  maxPlayers: 16,
         *  noPlayer: true // Remove host player (recommended!)
         * });
         *
         * room.setDefaultStadium("Big");
         * room.setScoreLimit(5);
         * room.setTimeLimit(0);
         *
         * // If there are no admins left in the room give admin to one of the remaining players.
         * function updateAdmins() {
         *   // Get all players
         *   var players = room.getPlayerList();
         *   if ( players.length == 0 ) return; // No players left, do nothing.
         *   if ( players.find((player) => player.admin) != null ) return; // There's an admin left so do nothing.
         *   room.setPlayerAdmin(players[0].id, true); // Give admin to the first non admin player in the list
         * }
         *
         * room.onPlayerJoin = function(player) {
         *   updateAdmins();
         * }
         *
         * room.onPlayerLeave = function(player) {
         *   updateAdmins();
         * }
         */
        HBInit(roomConfig: RoomConfigObject): RoomObject;
    }

    /**
     * RoomConfig is passed to HBInit to configure the room, all values are optional.
     */
    interface RoomConfigObject {
        /**
         * The name for the room.
         */
        roomName: string;
        /**
         * The name for the host player.
         */
        playerName?: string;
        /**
         * The password for the room (no password if ommited).
         */
        password?: string;
        /**
         * Max number of players the room accepts.
         */
        maxPlayers: number;
        /**
         * If true the room will appear in the room list.
         */
        public?: boolean;
        /**
         * GeoLocation override for the room.
         */
        geo?: RoomGeoLocation;
        /**
         * Can be used to skip the recaptcha by setting it to a token that can be obtained [here](https://www.haxball.com/headlesstoken)
         *
         * These tokens will expire after a few minutes.
         */
        token?: string;
        /**
         * If set to true the room player list will be empty, the playerName setting will be ignored.
         *
         * Default value is false for backwards compatibility reasons but it's recommended to set this to true.
         *
         * **Warning! events will have null as the byPlayer argument when the event is caused by the host, so make sure to check for null values!**
         */
        noPlayer?: boolean;
        /**
         * Proxy for Haxball.js.
         */
        proxy?: string;
    }

    /**
     * GeoLocation override for the room.
     */
    interface RoomGeoLocation {
        code?: string;
        lat?: number;
        lon?: number;
    }

    /**
     * TeamID are int values:
     *
     * Spectators: 0
     *
     * Red Team: 1
     *
     * Blue Team: 2
     */
    type TeamID = 0 | 1 | 2;

    /**
     * Haxball's default stadiums.
     */
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

    /**
     * 0 is no sound, 1 is normal sound and 2 is notification sound.
     */
    type ChatSounds = 0 | 1 | 2;

    /**
     * Not present in the original Haxball API docs,
     * but added for better clarity.
     *
     * Announcement sound options.
     */
    type ChatSoundString = "none" | "normal" | "notification";

    /**
     * Announcement style options.
     */
    type ChatStyle =
        | "normal"
        | "bold"
        | "italic"
        | "small"
        | "small-bold"
        | "small-italic";

    /**
     * XY position of a body
     */
    interface Position {
        x: number;
        y: number;
    }

    /**
     * PlayerObject holds information about a player
     */
    interface PlayerObject {
        /**
         * The id of the player, each player that joins the room gets a unique id that will never change.
         */
        id: number;
        /**
         * The name of the player.
         */
        name: string;
        /**
         * The team of the player.
         */
        team: TeamID;
        /**
         * Whether the player has admin rights.
         */
        admin: boolean;
        /**
         * The player's position in the field, if the player is not in the field the value will be null.
         */
        position: Position;
        /**
         * Raw connection string reported by the HaxBall backend.
         */
        conn: string;
        /**
         * The player's public ID. Players can view their own ID's here: https://www.haxball.com/playerauth
         *
         * The public ID is useful to validate that a player is who he claims to be, but can't be used to verify that a player isn't someone else. Which means it's useful for implementing user accounts, but not useful for implementing a banning system.
         *
         * This property is available when ID validation succeeds.
         */
        auth?: string;
        /**
         * Player IP address.
         */
        ip: string;
    }

    type RoomOperationKind =
        | "chat"
        | "chat-indicator"
        | "input"
        | "kick-ban"
        | "start-game"
        | "stop-game"
        | "pause-game"
        | "game-limit"
        | "stadium"
        | "player-team"
        | "teams-lock"
        | "player-admin"
        | "auto-teams"
        | "player-sync"
        | "avatar"
        | "team-colors"
        | "reorder-players"
        | "kick-rate-limit"
        | "other";

    interface RoomOperationObject {
        kind: RoomOperationKind;
        rawType: number;
        byPlayer: PlayerObject | null;
        targetPlayers: PlayerObject[];
        message: unknown;
    }

    type PlayerJoinDataObject = {
        id: number;
        name: string;
        flag: string;
        avatar: string;
        conn: string | null;
        auth: string | null;
    };

    type PlayerJoinDataResponse = {
        name?: string;
        flag?: string;
        avatar?: string;
    } | null | void;

    type PlayerIdentityObject = {
        id: number;
        name: string;
        flag: string;
        avatar: string;
        conn: string;
        auth: string;
    };

    type NodeHaxballBanEntryId = number;

    type NodeHaxballIPv4Range = { ip: number; mask: number };

    type NodeHaxballIPv6Range = { ip: BigInt; mask: BigInt };

    type NodeHaxballIpBanTarget =
        | string
        | NodeHaxballIPv4Range
        | NodeHaxballIPv6Range;

    type NodeHaxballSetRoomProperties = {
        name?: string | null;
        password?: string | null;
        geo?: { lat?: number; lon?: number; flag?: string } | null;
        playerCount?: number | null;
        maxPlayerCount?: number | null;
        fakePassword?: boolean | null;
        unlimitedPlayerCount?: boolean;
        showInRoomList?: boolean;
    };

    type NodeHaxballPoint = { x: number; y: number };

    type NodeHaxballStadium = object;

    type NodeHaxballVertex = {
        id: number;
        cGroup: number;
        cMask: number;
        bCoef: number;
        pos: NodeHaxballPoint;
    };

    type NodeHaxballSegment = object;

    type NodeHaxballGoal = object;

    type NodeHaxballPlane = object;

    type NodeHaxballDisc = {
        pos: NodeHaxballPoint;
        speed: NodeHaxballPoint;
        gravity: NodeHaxballPoint;
        radius: number;
        bCoef: number;
        invMass: number;
        damping: number;
        color: number;
        cMask: number;
        cGroup: number;
    };

    type NodeHaxballJoint = object;

    type NodeHaxballHaxballEvent = object;

    type NodeHaxballRoomConfig = object;

    type NodeHaxballPlugin = object;

    type NodeHaxballRenderer = object;

    type NodeHaxballLibrary = object;

    type NodeHaxballStartStreamingParams = {
        immediate?: boolean;
        onClientCount: (count: number) => void;
        emitData: (data: Uint8Array) => void;
    };

    type NodeHaxballStartStreamingReturnValue = {
        onOpen: () => void;
        onDataReceived: (data: Uint8Array) => void;
        interval: () => void;
    };

    type NodeHaxballCollisionFlagName =
        | "ball"
        | "red"
        | "blue"
        | "redKO"
        | "blueKO"
        | "wall"
        | "kick"
        | "score"
        | "c0"
        | "c1"
        | "c2"
        | "c3";

    type NodeHaxballColor = string | [number, number, number];

    type NodeHaxballTeamName = "red" | "blue";

    type NodeHaxballPlayerTeamName = "spec" | "red" | "blue";

    type NodeHaxballVertexParams = {
        x: number;
        y: number;
        bCoef?: number;
        cMask?: NodeHaxballCollisionFlagName[];
        cGroup?: NodeHaxballCollisionFlagName[];
    };

    type NodeHaxballSegmentParams = {
        v0: number;
        v1: number;
        color?: NodeHaxballColor;
        bias?: number;
        curve?: number;
        curveF?: number;
        vis?: boolean;
        bCoef?: number;
        cMask?: NodeHaxballCollisionFlagName[];
        cGroup?: NodeHaxballCollisionFlagName[];
    };

    type NodeHaxballSegmentFromObjParams = {
        v0: NodeHaxballVertex;
        v1: NodeHaxballVertex;
        color?: NodeHaxballColor;
        bias?: number;
        curve?: number;
        curveF?: number;
        vis?: boolean;
        bCoef?: number;
        cMask?: NodeHaxballCollisionFlagName[];
        cGroup?: NodeHaxballCollisionFlagName[];
    };

    type NodeHaxballGoalParams = {
        p0: [number, number];
        p1: [number, number];
        team: NodeHaxballTeamName;
    };

    type NodeHaxballPlaneParams = {
        normal: [number, number];
        dist: number;
        bCoef?: number;
        cMask?: NodeHaxballCollisionFlagName[];
        cGroup?: NodeHaxballCollisionFlagName[];
    };

    type NodeHaxballDiscParams = {
        pos: [number, number];
        radius: number;
        speed?: [number, number];
        gravity?: [number, number];
        invMass?: number;
        damping?: number;
        color?: NodeHaxballColor;
        bCoef?: number;
        cMask?: NodeHaxballCollisionFlagName[];
        cGroup?: NodeHaxballCollisionFlagName[];
    };

    type NodeHaxballJointParams = {
        d0: number;
        d1: number;
        color?: NodeHaxballColor;
        strength?: "rigid" | number;
        length?: number | [number, number];
    };

    type NodeHaxballJointFromObjParams = {
        d0: NodeHaxballDisc;
        d1: NodeHaxballDisc;
        color?: NodeHaxballColor;
        strength?: "rigid" | number;
        length?: number | [number, number];
    };

    type NodeHaxballSpawnPointParams = {
        x: number;
        y: number;
        team: NodeHaxballTeamName;
    };

    type NodeHaxballAddPlayerParams = {
        id: number;
        name: string;
        avatar: string;
        flag: string;
        team: NodeHaxballPlayerTeamName;
        pos?: [number, number];
        speed?: [number, number];
        gravity?: [number, number];
        radius?: number;
        invMass?: number;
        damping?: number;
        bCoef?: number;
        cMask?: NodeHaxballCollisionFlagName[];
        cGroup?: NodeHaxballCollisionFlagName[];
    };

    type NodeHaxballUpdateVertexParams = {
        x?: number;
        y?: number;
        bCoef?: number;
        cMask?: NodeHaxballCollisionFlagName[];
        cGroup?: NodeHaxballCollisionFlagName[];
    };

    type NodeHaxballUpdateSegmentParams = {
        v0?: number;
        v1?: number;
        color?: NodeHaxballColor;
        bias?: number;
        curve?: number;
        curveF?: number;
        vis?: boolean;
        bCoef?: number;
        cMask?: NodeHaxballCollisionFlagName[];
        cGroup?: NodeHaxballCollisionFlagName[];
    };

    type NodeHaxballUpdateGoalParams = {
        p0?: [number, number];
        p1?: [number, number];
        team?: NodeHaxballTeamName;
    };

    type NodeHaxballUpdatePlaneParams = {
        normal?: [number, number];
        dist?: number;
        bCoef?: number;
        cMask?: NodeHaxballCollisionFlagName[];
        cGroup?: NodeHaxballCollisionFlagName[];
    };

    type NodeHaxballUpdateDiscParams = {
        pos?: [number, number];
        radius?: number;
        speed?: [number, number];
        gravity?: [number, number];
        invMass?: number;
        damping?: number;
        color?: NodeHaxballColor;
        bCoef?: number;
        cMask?: NodeHaxballCollisionFlagName[];
        cGroup?: NodeHaxballCollisionFlagName[];
    };

    type NodeHaxballUpdateJointParams = {
        d0?: number;
        d1?: number;
        color?: NodeHaxballColor;
        strength?: "rigid" | number;
        length?: number | [number, number];
    };

    type NodeHaxballUpdateSpawnPointParams = {
        x?: number;
        y?: number;
        team?: NodeHaxballTeamName;
    };

    type NodeHaxballUpdatePlayerParams = {
        name?: string;
        avatar?: string;
        flag?: string;
        team?: NodeHaxballPlayerTeamName;
        pos?: [number, number];
        speed?: [number, number];
        gravity?: [number, number];
        radius?: number;
        invMass?: number;
        damping?: number;
        bCoef?: number;
        cMask?: NodeHaxballCollisionFlagName[];
        cGroup?: NodeHaxballCollisionFlagName[];
    };

    type NodeHaxballUpdateStadiumPlayerPhysicsParams = {
        radius?: number;
        gravity?: [number, number];
        invMass?: number;
        bCoef?: number;
        cGroup?: NodeHaxballCollisionFlagName[];
        damping?: number;
        kickingDamping?: number;
        acceleration?: number;
        kickingAcceleration?: number;
        kickStrength?: number;
        kickback?: number;
    };

    type NodeHaxballUpdateStadiumBgParams = {
        type?: 0 | 1 | 2;
        width?: number;
        height?: number;
        kickOffRadius?: number;
        cornerRadius?: number;
        color?: NodeHaxballColor;
        goalLine?: number;
    };

    type NodeHaxballUpdateStadiumGeneralParams = {
        name?: string;
        width?: number;
        height?: number;
        maxViewWidth?: number;
        cameraFollow?: 0 | 1;
        spawnDistance?: number;
        kickOffReset?: boolean;
        canBeStored?: boolean;
    };

    /**
     * ScoresObject holds information relevant to the current game scores
     */
    interface ScoresObject {
        /**
         * The number of goals scored by the red team
         */
        red: number;
        /**
         * The number of goals scored by the blue team
         */
        blue: number;
        /**
         * The number of seconds elapsed (seconds don't advance while the game is paused)
         */
        time: number;
        /**
         * The score limit for the game.
         */
        scoreLimit: number;
        /**
         * The time limit for the game.
         */
        timeLimit: number;
    }

    /**
     * DiscPropertiesObject holds information about a game physics disc.
     */
    interface DiscPropertiesObject {
        /**
         * The x coordinate of the disc's position
         */
        x?: number | null;
        /**
         * The y coordinate of the disc's position
         */
        y?: number | null;
        /**
         * The x coordinate of the disc's speed vector
         */
        xspeed?: number | null;
        /**
         * The y coordinate of the disc's speed vector
         */
        yspeed?: number | null;
        /**
         * The x coordinate of the disc's gravity vector
         */
        xgravity?: number | null;
        /**
         * The y coordinate of the disc's gravity vector
         */
        ygravity?: number | null;
        /**
         * The disc's radius
         */
        radius?: number | null;
        /**
         * The disc's bouncing coefficient
         */
        bCoeff?: number | null;
        /**
         * The inverse of the disc's mass
         */
        invMass?: number | null;
        /**
         * The disc's damping factor.
         */
        damping?: number | null;
        /**
         * The disc's color expressed as an integer (0xFF0000 is red, 0x00FF00 is green, 0x0000FF is blue, -1 is transparent)
         */
        color?: number | null;
        /**
         * The disc's collision mask (Represents what groups the disc can collide with)
         */
        cMask?: number | null;
        /**
         * The disc's collision groups
         */
        cGroup?: number | null;
    }

    /**
     * CollisionFlagsObjects contains flag constants that are used as helpers for reading and writing collision flags.
     *
     * The flags are ball, red, blue, redKO, blueKO, wall, all, kick, score, c0, c1, c2 and c3
     *
     * @example
     * var cf = room.CollisionFlags;
     *
     * // Check if disc 4 belongs to collision group "ball":
     * var discProps = room.getDiscProperties(4);
     * var hasBallFlag = (discProps.cGroup & cf.ball) != 0;
     *
     * // Add "wall" to the collision mask of disc 5 without changing any other of it's flags:
     * var discProps = room.getDiscProperties(5);
     * room.setDiscProperties(5, {cMask: discProps.cMask | cf.wall});
     */
    type CollisionFlagsObject = {
        all: 63;
        ball: 1;
        blue: 4;
        blueKO: 16;
        c0: 268435456;
        c1: 536870912;
        c2: 1073741824;
        c3: -2147483648;
        kick: 64;
        red: 2;
        redKO: 8;
        score: 128;
        wall: 32;
    };

    type LegacyHeadlessRoomObject = {
        /**
         * Object filled with the collision flags constants that compose the cMask and cGroup disc properties.
         *
         * [Read more about collision flags here](https://github.com/haxball/haxball-issues/wiki/Collision-Flags).
         *
         * @example
         * // Check if disc 4 belongs to collision group "ball":
         * var discProps = room.getDiscProperties(4);
         * var hasBallFlag = (discProps.cGroup & room.CollisionFlags.ball) != 0;
         *
         * // Add "wall" to the collision mask of disc 5 without changing any other of it's flags:
         * var discProps = room.getDiscProperties(5);
         * room.setDiscProperties(5, {cMask: discProps.cMask | room.CollisionFlags.wall});
         */
        CollisionFlags: CollisionFlagsObject;

        /**
         * Sends a chat message using the host player
         *
         * If targetId is null or undefined the message is sent to all players. If targetId is defined the message is sent only to the player with a matching id.
         */
        sendChat(message: string, targetId?: number | null): void;
        /**
         * Changes the admin status of the specified player
         */
        setPlayerAdmin(playerID: number, admin: boolean): void;
        /**
         * Moves the specified player to a team
         */
        setPlayerTeam(playerID: number, team: number): void;
        /**
         * Kicks the specified player from the room
         */
        kickPlayer(playerID: number, reason: string, ban: boolean): void;
        /**
         * Clears the ban for a playerId that belonged to a player that was previously banned.
         */
        clearBan(playerId: number): void;
        /**
         * Clears the list of banned players.
         */
        clearBans(): void;
        /**
         * Sets the score limit of the room
         *
         * If a game is in progress this method does nothing.
         */
        setScoreLimit(limit: number): void;
        /**
         * Sets the time limit of the room. The limit must be specified in number of minutes.
         *
         * If a game is in progress this method does nothing.
         */
        setTimeLimit(limitInMinutes: number): void;
        /**
         * Parses the stadiumFileContents as a .hbs stadium file and sets it as the selected stadium.
         *
         * There must not be a game in progress, If a game is in progress this method does nothing
         *
         * See example [here](https://github.com/haxball/haxball-issues/blob/master/headless/examples/setCustomStadium.js).
         */
        setCustomStadium(stadiumFileContents: string): void;
        /**
         * Sets the selected stadium to one of the default stadiums. The name must match exactly (case sensitive)
         *
         * There must not be a game in progress, If a game is in progress this method does nothing
         */
        setDefaultStadium(stadiumName: DefaultStadiums): void;
        /**
         * Sets the teams lock. When teams are locked players are not able to change team unless they are moved by an admin.
         */
        setTeamsLock(locked: boolean): void;
        /**
         * Sets the colors of a team.
         *
         * Colors are represented as an integer, for example a pure red color is `0xFF0000`.
         */
        setTeamColors(
            team: TeamID,
            angle: number,
            textColor: number,
            colors: number[],
        ): void;
        /**
         * Starts the game, if a game is already in progress this method does nothing
         */
        startGame(): void;
        /**
         * Stops the game, if no game is in progress this method does nothing
         */
        stopGame(): void;
        /**
         * Sets the pause state of the game. true = paused and false = unpaused
         */
        pauseGame(pauseState?: boolean): void;
        /**
         * Returns the player with the specified id. Returns null if the player doesn't exist.
         */
        getPlayer(playerId: number): PlayerObject;
        /**
         * Returns the current list of players
         */
        getPlayerList(): PlayerObject[];
        /**
         * If a game is in progress it returns the current score information. Otherwise it returns null
         */
        getScores(): ScoresObject;
        /**
         * Returns the ball's position in the field or null if no game is in progress.
         */
        getBallPosition(): Position;
        /**
         * Starts recording of a haxball replay.
         *
         * Don't forget to call stop recording or it will cause a memory leak.
         */
        startRecording(): void;
        /**
         * Stops the recording previously started with startRecording and returns the replay file contents as a Uint8Array.
         *
         * Returns null if recording was not started or had already been stopped.
         */
        stopRecording(): Uint8Array;
        /**
         * Changes the password of the room, if pass is null the password will be cleared.
         */
        setPassword(pass: string | null): void;
        /**
         * Activates or deactivates the recaptcha requirement to join the room.
         */
        setRequireRecaptcha(required: boolean): void;
        /**
         * First all players listed are removed, then they are reinserted in the same order they appear in the playerIdList.
         *
         * If moveToTop is true players are inserted at the top of the list, otherwise they are inserted at the bottom of the list.
         */
        reorderPlayers(playerIdList: Array<number>, moveToTop: boolean): void;
        /**
         * Sends a host announcement with msg as contents. Unlike sendChat, announcements will work without a host player and has a larger limit on the number of characters.
         *
         * If targetId is null or undefined the message is sent to all players, otherwise it's sent only to the player with matching targetId.
         *
         * color will set the color of the announcement text, it's encoded as an integer (0xFF0000 is red, 0x00FF00 is green, 0x0000FF is blue).
         *
         * If color is null or undefined the text will use the default chat color.
         *
         * style will set the style of the announcement text, it must be one of the following strings: `"normal","bold","italic", "small", "small-bold", "small-italic"`
         *
         * If style is null or undefined `"normal"` style will be used.
         *
         * If sound is set to 0 the announcement will produce no sound. If sound is set to 1 the announcement will produce a normal chat sound. If set to 2 it will produce a notification sound.
         */
        sendAnnouncement(
            msg: string,
            targetId?: number | null,
            color?: number | string | null,
            style?: ChatStyle,
            sound?: ChatSounds,
        ): void;
        /**
         * Sets the room's kick rate limits.
         *
         * `min` is the minimum number of logic-frames between two kicks. It is impossible to kick faster than this.
         *
         * `rate` works like min but lets players save up extra kicks to use them later depending on the value of burst.
         *
         * `burst` determines how many extra kicks the player is able to save up.
         */
        setKickRateLimit(min: number, rate: number, burst: number): void;
        /**
         * Overrides the avatar of the target player.
         *
         * If avatar is set to null the override is cleared and the player will be able to use his own avatar again.
         */
        setPlayerAvatar(
            playerId: number,
            avatar: string | null,
            headless?: boolean,
        ): void;
        /**
         * Sets properties of the target disc.
         *
         * Properties that are null or undefined will not be set and therefor will preserve whatever value the disc already had.
         *
         * For example `room.setDiscProperties(0, {x: 0, y: 0});` will set the position of disc 0 to <0,0> while leaving any other value intact.
         */
        setDiscProperties(
            discIndex: number,
            properties: DiscPropertiesObject,
        ): void;
        /**
         * Gets the properties of the disc at discIndex. Returns null if discIndex is out of bounds.
         */
        getDiscProperties(discIndex: number): DiscPropertiesObject;
        /**
         * Same as setDiscProperties but targets the disc belonging to a player with the given Id.
         */
        setPlayerDiscProperties(
            playerId: number,
            properties: DiscPropertiesObject,
        ): void;
        /**
         * Same as getDiscProperties but targets the disc belonging to a player with the given Id.
         */
        getPlayerDiscProperties(playerId: number): DiscPropertiesObject;
        /**
         * Gets the number of discs in the game including the ball and player discs.
         */
        getDiscCount(): number;

        /**
         * Event called when a new player joins the room.
         */
        onPlayerJoin(player: PlayerObject): boolean | void;
        /**
         * Event called when a player leaves the room.
         */
        onPlayerLeave(player: PlayerObject): boolean | void;
        /**
         * Event called when a team wins.
         */
        onTeamVictory(scores: ScoresObject): void;
        /**
         * Event called when a player sends a chat message.
         *
         * The event function can return `false` in order to filter the chat message. This prevents the chat message from reaching other players in the room.
         */
        onPlayerChat(player: PlayerObject, message: string): boolean | void;
        /**
         * Event called when a player kicks the ball.
         */
        onPlayerBallKick(player: PlayerObject): void;
        /**
         * Event called when a team scores a goal.
         */
        onTeamGoal(team: TeamID): void;
        /**
         * Event called when a game starts.
         *
         * `byPlayer` is the player which caused the event (can be null if the event wasn't caused by a player).
         */
        onGameStart(byPlayer: PlayerObject | null): void;
        /**
         * Event called when a game stops.
         *
         * `byPlayer` is the player which caused the event (can be null if the event wasn't caused by a player).
         */
        onGameStop(byPlayer: PlayerObject | null): void;
        /**
         * Event called when a player's admin rights are changed.
         *
         * `byPlayer` is the player which caused the event (can be null if the event wasn't caused by a player).
         */
        onPlayerAdminChange(
            changedPlayer: PlayerObject,
            byPlayer: PlayerObject | null,
        ): void;
        /**
         * Event called when a player team is changed.
         *
         * `byPlayer` is the player which caused the event (can be null if the event wasn't caused by a player).
         */
        onPlayerTeamChange(
            changedPlayer: PlayerObject,
            byPlayer: PlayerObject | null,
        ): void;
        /**
         * Event called before a player-initiated kick or ban is applied.
         *
         * Return `false` to cancel the kick/ban.
         */
        onBeforeKick(
            kickedPlayer: PlayerObject | null,
            reason: string,
            ban: boolean,
            byPlayer: PlayerObject,
        ): boolean | void;
        /**
         * Event called before a low-level room operation is applied.
         *
         * Return `false` to cancel the operation.
         */
        onBeforeOperation(operation: RoomOperationObject): boolean | void;
        /**
         * Event called when a player has been kicked from the room. This is always called after the onPlayerLeave event.
         *
         * byPlayer is the player which caused the event (can be null if the event wasn't caused by a player).
         */
        onPlayerKicked(
            kickedPlayer: PlayerObject,
            reason: string,
            ban: boolean,
            byPlayer: PlayerObject | null,
        ): void;
        /**
         * Event called once for every game tick (happens 60 times per second). This is useful if you want to monitor the player and ball positions without missing any ticks.
         *
         * This event is not called if the game is paused or stopped.
         */
        onGameTick(): void;
        /**
         * Event called when the game is paused.
         */
        onGamePause(byPlayer: PlayerObject | null): void;
        /**
         * Event called when the game is unpaused.
         *
         * After this event there's a timer before the game is fully unpaused, to detect when the game has really resumed you can listen for the first onGameTick event after this event is called.
         */
        onGameUnpause(byPlayer: PlayerObject | null): void;
        /**
         * Event called when the players and ball positions are reset after a goal happens.
         */
        onPositionsReset(): void;
        /**
         * Event called when a player gives signs of activity, such as pressing a key. This is useful for detecting inactive players.
         */
        onPlayerActivity(player: PlayerObject): void;
        /**
         * Event called when the stadium is changed.
         */
        onStadiumChange(
            newStadiumName: string,
            byPlayer: PlayerObject | null,
        ): void;
        /**
         * Event called when the room link is obtained.
         */
        onRoomLink(url: string): void;
        /**
         * Event called when the kick rate is set.
         */
        onKickRateLimitSet(
            min: number,
            rate: number,
            burst: number,
            byPlayer: PlayerObject | null,
        ): void;
        /**
         * Event called when the teams lock setting is changed.
         */
        onTeamsLockChange(locked: boolean, byPlayer: PlayerObject | null): void;
    };

    type NodeHaxballRoomObject = {
        leave(): void;
        setProperties(properties: NodeHaxballSetRoomProperties): void;
        setHandicap(handicap: number): void;
        addPlayerBan(playerId: number): NodeHaxballBanEntryId | null;
        addIpBan(
            ...ips: NodeHaxballIpBanTarget[]
        ): Array<NodeHaxballBanEntryId | null>;
        addAuthBan(...auths: string[]): Array<NodeHaxballBanEntryId | null>;
        removeBan(id: NodeHaxballBanEntryId): boolean;
        executeEvent(event: NodeHaxballHaxballEvent, byId: number): void;
        executeEventWithTarget(
            event: NodeHaxballHaxballEvent,
            targetId: number,
        ): void;
        clearEvents(): void;
        setAvatar(avatar: string): void;
        setChatIndicatorActive(active: boolean): void;
        setUnlimitedPlayerCount(on: boolean): void;
        setFakePassword(fakePassword: boolean | null): void;
        sendCustomEvent(type: number, data: object, targetId?: number): void;
        sendBinaryCustomEvent(
            type: number,
            data: Uint8Array,
            targetId?: number,
        ): void;
        setPlayerIdentity(
            playerId: number,
            data: object,
            targetId?: number,
        ): void;
        getKeyState(): number;
        setKeyState(state: number, instant?: boolean): void;
        isGamePaused(): boolean;
        autoTeams(): void;
        changeTeam(teamId: TeamID): void;
        resetTeam(teamId: TeamID): void;
        resetTeams(): void;
        randTeams(): void;
        setSync(value: boolean): void;
        setCurrentStadium(stadium: NodeHaxballStadium): void;
        getBall(extrapolated?: boolean): NodeHaxballDisc;
        getDiscs(extrapolated?: boolean): NodeHaxballDisc[];
        getDisc(discId: number, extrapolated?: boolean): NodeHaxballDisc;
        getPlayerDisc(
            playerId: number,
            extrapolated?: boolean,
        ): NodeHaxballDisc;
        getPlayerDisc_exp(playerId: number): NodeHaxballDisc;
        setPluginActive(name: string, active: boolean): void;
        startStreaming(
            params: NodeHaxballStartStreamingParams,
        ): NodeHaxballStartStreamingReturnValue | null;
        stopStreaming(): void;
        isRecording(): boolean;
        extrapolate(
            milliseconds: number,
            ignoreMultipleCalls?: boolean,
        ): object;
        setConfig(roomConfig: NodeHaxballRoomConfig): void;
        mixConfig(roomConfig: NodeHaxballRoomConfig): void;
        addPlugin(plugin: NodeHaxballPlugin): void;
        movePlugin(pluginIndex: number, newIndex: number): void;
        updatePlugin(pluginIndex: number, plugin: NodeHaxballPlugin): void;
        removePlugin(plugin: NodeHaxballPlugin): void;
        setRenderer(renderer: NodeHaxballRenderer): void;
        addLibrary(library: NodeHaxballLibrary): void;
        moveLibrary(libraryIndex: number, newIndex: number): void;
        updateLibrary(libraryIndex: number, library: NodeHaxballLibrary): void;
        removeLibrary(library: NodeHaxballLibrary): void;
        takeSnapshot(): object;
        fakePlayerJoin(
            id: number,
            name: string,
            flag: string,
            avatar: string,
            conn: string,
            auth: string,
        ): void;
        fakePlayerLeave(id: number): {
            id: number;
            name: string;
            flag: string;
            avatar: string;
            conn: string;
            auth: string;
        };
        fakeSendPlayerInput(input: number, byId: number): void;
        fakeSendPlayerChat(message: string, byId: number): void;
        fakeSetPlayerChatIndicator(value: boolean, byId: number): void;
        fakeSetPlayerAvatar(value: string, byId: number): void;
        fakeSetPlayerAdmin(
            playerId: number,
            value: boolean,
            byId: number,
        ): void;
        fakeSetPlayerSync(value: boolean, byId: number): void;
        fakeSetStadium(stadium: NodeHaxballStadium, byId: number): void;
        fakeStartGame(byId: number): void;
        fakeStopGame(byId: number): void;
        fakeSetGamePaused(value: boolean, byId: number): void;
        fakeSetScoreLimit(value: number, byId: number): void;
        fakeSetTimeLimit(value: number, byId: number): void;
        fakeSetTeamsLock(value: boolean, byId: number): void;
        fakeAutoTeams(byId: number): void;
        fakeSetPlayerTeam(playerId: number, teamId: TeamID, byId: number): void;
        fakeSetKickRateLimit(
            min: number,
            rate: number,
            burst: number,
            byId: number,
        ): void;
        fakeSetTeamColors(
            teamId: TeamID,
            angle: number,
            colors: number[],
            byId: number,
        ): void;
        fakeKickPlayer(
            playerId: number,
            reason: string | null,
            ban: boolean,
            byId: number,
        ): void;
    };

    type RoomObject = LegacyHeadlessRoomObject &
        NodeHaxballRoomObject & {
            /**
             * Event called before a new player is accepted by the room.
             *
             * Return null to block the join, or return changed name/flag/avatar fields to alter the visible player data.
             */
            onBeforePlayerJoin?: (
                player: PlayerJoinDataObject,
            ) => PlayerJoinDataResponse | Promise<PlayerJoinDataResponse>;
            getPlayerIdentity(playerId: number): PlayerIdentityObject | null;
            sendPlayerJoinTo(
                identity: PlayerIdentityObject,
                targetId: number,
            ): void;
            sendPlayerLeaveTo(playerId: number, targetId: number): void;
            /**
             * Cancels room creation while opening, or leaves after open.
             */
            cancel?: () => void;
            /**
             * Sends a recaptcha token to node-haxball room creation.
             */
            useRecaptchaToken?: (token: string) => void;
        };
}
