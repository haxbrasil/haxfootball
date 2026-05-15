import createHaxballApi from "node-haxball";
import { HttpsProxyAgent } from "https-proxy-agent";

type NativePlayer = {
    id: number;
    name: string;
    team: {
        id: number;
        color: number;
        defenseDir: number;
        cMask: number;
        cGroup: number;
    };
    flag: string;
    avatar: string | null;
    headlessAvatar: string | null;
    isAdmin: boolean;
    avatarNumber: number;
    conn: string | null;
    auth: string | null;
    customClient: boolean;
    ping: number;
    input: number;
    kickRateMinTickCounter: number;
    kickRateMaxTickCounter: number;
    isKicking: boolean;
    sync: boolean;
    disc: NativePlayerDisc | null;
    ext: NativePlayer | null;
    identity: object | null;
};

type NativeRoom = NodeHaxballRoomObject & {
    isHost: boolean;
    currentPlayerId: number;
    currentPlayer: object;
    state: { teamsLocked: boolean };
    stateExt: object | null;
    gameState: {
        redScore: number;
        blueScore: number;
        timeElapsed: number;
        scoreLimit: number;
        timeLimit: number;
        physicsState: { discs: NativeDisc[] };
    } | null;
    gameStateExt: object | null;
    sdp: string;
    config: object;
    renderer: object | null;
    plugins: object[];
    pluginsMap: object;
    libraries: object[];
    librariesMap: object;
    name: string;
    link: string;
    timeLimit: number;
    scoreLimit: number;
    stadium: object;
    players: NativePlayer[];
    redScore: number | null;
    blueScore: number | null;
    timeElapsed: number | null;
    currentFrameNo: number;
    banList: object[];
    password: string;
    geo: { lat: number; lon: number; flag: string | number };
    maxPlayerCount: number;
    fakePassword: boolean | null;
    fixedPlayerCount: number | null;
    showInRoomList: boolean;
    unlimitedPlayerCount: boolean;
    token: string;
    requireRecaptcha: boolean;
    debugDesync: unknown;
    getPlayer(playerId: number): NativePlayer | null;
    getBall(extrapolated?: boolean): NativeDisc;
    getDiscs(extrapolated?: boolean): NativeDisc[];
    getDisc(discId: number, extrapolated?: boolean): NativeDisc;
    getPlayerDisc(playerId: number, extrapolated?: boolean): NativeDisc;
    getPlayerDisc_exp(playerId: number): NativeDisc;
    setTeamColors(
        teamId: number,
        angle: number,
        textColor: number,
        ...colors: number[]
    ): void;
    pauseGame(): void;
    lockTeams(): void;
    setPlayerAvatar(id: number, value: string | null, headless: boolean): void;
    setDiscProperties(
        discIndex: number,
        properties: DiscPropertiesObject,
    ): void;
    setPlayerDiscProperties(
        playerId: number,
        properties: DiscPropertiesObject,
    ): void;
    sendAnnouncement(
        message: string,
        targetId: number | null,
        color: number,
        style: ChatStyle,
        sound: ChatSounds,
    ): void;
    onPlayerJoin?: unknown;
    onPlayerLeave?: unknown;
    onGameEnd?: unknown;
    onPlayerBallKick?: unknown;
    onTeamGoal?: unknown;
    onGameStart?: unknown;
    onGameStop?: unknown;
    onPlayerAdminChange?: unknown;
    onPlayerTeamChange?: unknown;
    onGameTick?: unknown;
    onGamePauseChange?: unknown;
    onPositionsReset?: unknown;
    onPlayerInputChange?: unknown;
    onStadiumChange?: unknown;
    onRoomLink?: unknown;
    onKickRateLimitChange?: unknown;
    onTeamsLockChange?: unknown;
    onBeforeOperationReceived?: unknown;
    sendChat(message: string, targetId: number | null): void;
    setPlayerAdmin(playerId: number, admin: boolean): void;
    setPlayerTeam(playerId: number, team: TeamID): void;
    kickPlayer(playerId: number, reason: string | null, ban: boolean): void;
    clearBan(playerId: number): void;
    clearBans(): void;
    setScoreLimit(limit: number): void;
    setTimeLimit(limit: number): void;
    startGame(): void;
    stopGame(): void;
    startRecording(): boolean;
    stopRecording(): Uint8Array | null;
    reorderPlayers(playerIdList: number[], moveToTop: boolean): void;
    setKickRateLimit(min: number, rate: number, burst: number): void;
};

type NativeDisc = {
    pos: { x: number; y: number };
    speed: { x: number; y: number };
    gravity: { x: number; y: number };
    radius: number;
    bCoef: number;
    invMass: number;
    damping: number;
    color: number;
    cMask: number;
    cGroup: number;
};

type NativeModifyPlayerDataResult = null | [string, string, string];

type NativeModifyPlayerDataRoom = NativeRoom & {
    modifyPlayerData?: (
        playerId: number,
        name: string,
        flag: string,
        avatar: string,
        conn: string,
        auth: string,
        customData?: unknown,
    ) => NativeModifyPlayerDataResult | Promise<NativeModifyPlayerDataResult>;
};

type MutableHaxballEvent = NodeHaxballHaxballEvent & { byId?: number };

type NativePlayerDisc = NativeDisc & {
    playerId: number | null;
    ext: NativePlayerDisc | null;
};

type ChatOperation = {
    byId: number;
    text: string;
};

type KickBanOperation = {
    id: number;
    byId: number;
    reason: string | null;
    ban: boolean;
};

type OperationMessage = {
    byId?: unknown;
    id?: unknown;
    playerId?: unknown;
    playerIdList?: unknown;
};

const haxball = createHaxballApi();

function normalizeGeo(geo: RoomGeoLocation): {
    lat: number;
    lon: number;
    flag: string;
} {
    return {
        lat: geo.lat ?? 0,
        lon: geo.lon ?? 0,
        flag: geo.code ?? "br",
    };
}

function decodeIp(conn: string | null): string {
    if (!conn) return "";

    try {
        const decoded = haxball.Utils.hexStrToNumber(conn);
        if (typeof decoded === "string" && decoded !== "") return decoded;
    } catch {
        // Keep the old haxball.js fallback for connection strings that are not hex encoded.
    }

    try {
        return decodeURIComponent(conn.replace(/(..)/g, "%$1"));
    } catch {
        return conn;
    }
}

function toTeamId(teamId: number): TeamID {
    if (teamId === 1 || teamId === 2) return teamId;
    return 0;
}

function convertPlayer(
    player: NativePlayer | null | undefined,
): PlayerObject | null {
    if (!player) return null;

    const position = player.disc
        ? {
              x: player.disc.pos.x,
              y: player.disc.pos.y,
          }
        : { x: 0, y: 0 };

    const converted = {
        name: player.name,
        team: toTeamId(player.team.id),
        id: player.id,
        admin: player.isAdmin,
        position,
        conn: player.conn ?? "",
        ip: decodeIp(player.conn),
    };

    return player.auth === null
        ? converted
        : { ...converted, auth: player.auth };
}

function getScoresObject(room: NativeRoom): ScoresObject | null {
    if (!room.gameState) return null;

    return {
        red: room.gameState.redScore,
        blue: room.gameState.blueScore,
        time: room.gameState.timeElapsed,
        scoreLimit: room.gameState.scoreLimit,
        timeLimit: room.gameState.timeLimit,
    };
}

function getDiscPropertiesObject(
    disc: NativeDisc | null | undefined,
): DiscPropertiesObject | null {
    if (!disc) return null;

    return {
        x: disc.pos.x,
        y: disc.pos.y,
        xspeed: disc.speed.x,
        yspeed: disc.speed.y,
        xgravity: disc.gravity.x,
        ygravity: disc.gravity.y,
        radius: disc.radius,
        bCoeff: disc.bCoef,
        invMass: disc.invMass,
        damping: disc.damping,
        color: disc.color,
        cMask: disc.cMask,
        cGroup: disc.cGroup,
    };
}

function createProxyAgent(proxy?: string): HttpsProxyAgent<string> | undefined {
    return proxy ? new HttpsProxyAgent(proxy) : undefined;
}

function isChatOperation(message: unknown): message is ChatOperation {
    return (
        typeof message === "object" &&
        message !== null &&
        "byId" in message &&
        "text" in message &&
        typeof message.byId === "number" &&
        typeof message.text === "string"
    );
}

function isKickBanOperation(message: unknown): message is KickBanOperation {
    return (
        typeof message === "object" &&
        message !== null &&
        "id" in message &&
        "byId" in message &&
        "reason" in message &&
        "ban" in message &&
        typeof message.id === "number" &&
        typeof message.byId === "number" &&
        (typeof message.reason === "string" || message.reason === null) &&
        typeof message.ban === "boolean"
    );
}

function createHostEvent(event: NodeHaxballHaxballEvent): MutableHaxballEvent {
    const hostEvent = event as MutableHaxballEvent;
    hostEvent.byId = 0;
    return hostEvent;
}

function getOperationNumber(
    message: OperationMessage,
    key: keyof OperationMessage,
): number | null {
    const value = message[key];
    return typeof value === "number" ? value : null;
}

function getOperationNumberList(
    message: OperationMessage,
    key: keyof OperationMessage,
): number[] {
    const value = message[key];

    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((item): item is number => typeof item === "number");
}

function toRoomOperationKind(type: number): RoomOperationKind {
    switch (type) {
        case haxball.OperationType.SendChat:
            return "chat";
        case haxball.OperationType.SendChatIndicator:
            return "chat-indicator";
        case haxball.OperationType.SendInput:
            return "input";
        case haxball.OperationType.KickBanPlayer:
            return "kick-ban";
        case haxball.OperationType.StartGame:
            return "start-game";
        case haxball.OperationType.StopGame:
            return "stop-game";
        case haxball.OperationType.PauseResumeGame:
            return "pause-game";
        case haxball.OperationType.SetGamePlayLimit:
            return "game-limit";
        case haxball.OperationType.SetStadium:
            return "stadium";
        case haxball.OperationType.SetPlayerTeam:
            return "player-team";
        case haxball.OperationType.SetTeamsLock:
            return "teams-lock";
        case haxball.OperationType.SetPlayerAdmin:
            return "player-admin";
        case haxball.OperationType.AutoTeams:
            return "auto-teams";
        case haxball.OperationType.SetPlayerSync:
            return "player-sync";
        case haxball.OperationType.SetAvatar:
            return "avatar";
        case haxball.OperationType.SetTeamColors:
            return "team-colors";
        case haxball.OperationType.ReorderPlayers:
            return "reorder-players";
        case haxball.OperationType.SetKickRateLimit:
            return "kick-rate-limit";
        default:
            return "other";
    }
}

function createRoomOperation(
    room: NativeRoom,
    type: number,
    message: unknown,
): RoomOperationObject {
    const operationMessage =
        typeof message === "object" && message !== null
            ? (message as OperationMessage)
            : {};
    const byId = getOperationNumber(operationMessage, "byId");
    const byPlayer =
        byId && byId !== 0 ? convertPlayer(room.getPlayer(byId)) : null;
    const targetIds = [
        getOperationNumber(operationMessage, "id"),
        getOperationNumber(operationMessage, "playerId"),
        ...getOperationNumberList(operationMessage, "playerIdList"),
    ].filter((id): id is number => id !== null && id !== byId);

    return {
        kind: toRoomOperationKind(type),
        rawType: type,
        byPlayer,
        targetPlayers: targetIds
            .map((id) => convertPlayer(room.getPlayer(id)))
            .filter((player): player is PlayerObject => player !== null),
        message,
    };
}

class HaxballCompatibilityRoom {
    public readonly CollisionFlags: CollisionFlagsObject = {
        all: 63,
        ball: haxball.CollisionFlags.ball,
        blue: haxball.CollisionFlags.blue,
        blueKO: haxball.CollisionFlags.blueKO,
        c0: haxball.CollisionFlags.c0,
        c1: haxball.CollisionFlags.c1,
        c2: haxball.CollisionFlags.c2,
        c3: haxball.CollisionFlags.c3,
        kick: haxball.CollisionFlags.kick,
        red: haxball.CollisionFlags.red,
        redKO: haxball.CollisionFlags.redKO,
        score: haxball.CollisionFlags.score,
        wall: haxball.CollisionFlags.wall,
    };

    private nativeRoom: NativeRoom | null = null;
    private cancelCreation: (() => void) | null = null;
    private sendRecaptchaToken: ((token: string) => void) | null = null;

    public onPlayerJoin = (_player: PlayerObject): boolean | void => {};
    public onBeforePlayerJoin = (
        _player: PlayerJoinDataObject,
    ): PlayerJoinDataResponse | Promise<PlayerJoinDataResponse> => {};
    public onPlayerLeave = (_player: PlayerObject): boolean | void => {};
    public onTeamVictory = (_scores: ScoresObject): void => {};
    public onPlayerChat = (_player: PlayerObject, _message: string): boolean =>
        true;
    public onPlayerBallKick = (_player: PlayerObject): void => {};
    public onTeamGoal = (_team: TeamID): void => {};
    public onGameStart = (_byPlayer: PlayerObject | null): void => {};
    public onGameStop = (_byPlayer: PlayerObject | null): void => {};
    public onPlayerAdminChange = (
        _changedPlayer: PlayerObject,
        _byPlayer: PlayerObject | null,
    ): void => {};
    public onPlayerTeamChange = (
        _changedPlayer: PlayerObject,
        _byPlayer: PlayerObject | null,
    ): void => {};
    public onBeforeKick = (
        _kickedPlayer: PlayerObject | null,
        _reason: string,
        _ban: boolean,
        _byPlayer: PlayerObject,
    ): boolean => true;
    public onBeforeOperation = (_operation: RoomOperationObject): boolean =>
        true;
    public onPlayerKicked = (
        _kickedPlayer: PlayerObject,
        _reason: string,
        _ban: boolean,
        _byPlayer: PlayerObject | null,
    ): void => {};
    public onGameTick = (): void => {};
    public onGamePause = (_byPlayer: PlayerObject | null): void => {};
    public onGameUnpause = (_byPlayer: PlayerObject | null): void => {};
    public onPositionsReset = (): void => {};
    public onPlayerActivity = (_player: PlayerObject): void => {};
    public onStadiumChange = (
        _newStadiumName: string,
        _byPlayer: PlayerObject | null,
    ): void => {};
    public onRoomLink = (_url: string): void => {};
    public onKickRateLimitSet = (
        _min: number,
        _rate: number,
        _burst: number,
        _byPlayer: PlayerObject | null,
    ): void => {};
    public onTeamsLockChange = (
        _locked: boolean,
        _byPlayer: PlayerObject | null,
    ): void => {};

    private get room(): NativeRoom {
        if (!this.nativeRoom) {
            throw new Error("The node-haxball room is not open yet.");
        }

        return this.nativeRoom;
    }

    public async open(config: RoomConfigObject): Promise<void> {
        const geo = config.geo
            ? normalizeGeo(config.geo)
            : await haxball.Utils.getGeo();
        const proxyAgent = createProxyAgent(config.proxy);
        const creation = haxball.Room.create(
            {
                name: config.roomName,
                token: config.token ?? "",
                geo,
                maxPlayerCount: config.maxPlayers,
                showInRoomList: config.public ?? false,
                ...(config.password ? { password: config.password } : {}),
                ...(config.noPlayer === undefined
                    ? {}
                    : { noPlayer: config.noPlayer }),
            },
            {
                storage: {
                    crappy_router: false,
                    player_name: config.playerName ?? "Host",
                    avatar: "",
                    geo,
                },
                ...(proxyAgent ? { proxyAgent } : {}),
                preInit: (room: NativeRoom) => {
                    this.nativeRoom = room;
                    this.installCallbacks(room);
                },
                onOpen: (room: NativeRoom) => {
                    this.nativeRoom = room;
                },
                onClose: (reason) => {
                    this.nativeRoom = null;
                    if (reason) {
                        console.error("node-haxball room closed:", reason);
                    }
                },
            },
        );

        this.cancelCreation = creation.cancel;
        this.sendRecaptchaToken = creation.useRecaptchaToken;
    }

    private installCallbacks(room: NativeRoom): void {
        (room as NativeModifyPlayerDataRoom).modifyPlayerData = async (
            id,
            name,
            flag,
            avatar,
            conn,
            auth,
        ) => {
            const response = await this.onBeforePlayerJoin({
                id,
                name,
                flag,
                avatar,
                conn: conn || null,
                auth: auth || null,
            });

            if (response === null) {
                return null;
            }

            return [
                response?.name ?? name,
                response?.flag ?? flag,
                response?.avatar ?? avatar,
            ];
        };

        room.onPlayerJoin = (player: NativePlayer) => {
            const convertedPlayer = convertPlayer(player);
            if (convertedPlayer) this.onPlayerJoin(convertedPlayer);
        };

        room.onPlayerLeave = (
            player: NativePlayer,
            reason: string | null,
            isBanned: boolean,
            byId: number,
        ) => {
            const convertedPlayer = convertPlayer(player);
            if (!convertedPlayer) return;

            this.onPlayerLeave(convertedPlayer);

            if (reason !== null) {
                this.onPlayerKicked(
                    convertedPlayer,
                    reason,
                    isBanned,
                    convertPlayer(room.getPlayer(byId)),
                );
            }
        };

        room.onGameEnd = () => {
            const scores = getScoresObject(room);
            if (scores) this.onTeamVictory(scores);
        };

        room.onPlayerBallKick = (playerId: number) => {
            const player = convertPlayer(room.getPlayer(playerId));
            if (player) this.onPlayerBallKick(player);
        };

        room.onTeamGoal = (teamId: TeamID) => this.onTeamGoal(teamId);

        room.onGameStart = (byId: number) =>
            this.onGameStart(convertPlayer(room.getPlayer(byId)));

        room.onGameStop = (byId: number) =>
            this.onGameStop(convertPlayer(room.getPlayer(byId)));

        room.onPlayerAdminChange = (
            id: number,
            _isAdmin: boolean,
            byId: number,
        ) => {
            const changedPlayer = convertPlayer(room.getPlayer(id));
            if (changedPlayer) {
                this.onPlayerAdminChange(
                    changedPlayer,
                    convertPlayer(room.getPlayer(byId)),
                );
            }
        };

        room.onPlayerTeamChange = (
            id: number,
            _teamId: number,
            byId: number,
        ) => {
            const changedPlayer = convertPlayer(room.getPlayer(id));
            if (changedPlayer) {
                this.onPlayerTeamChange(
                    changedPlayer,
                    convertPlayer(room.getPlayer(byId)),
                );
            }
        };

        room.onGameTick = () => this.onGameTick();

        room.onGamePauseChange = (isPaused: boolean, byId: number) => {
            const byPlayer = convertPlayer(room.getPlayer(byId));
            if (isPaused) {
                this.onGamePause(byPlayer);
            } else {
                this.onGameUnpause(byPlayer);
            }
        };

        room.onPositionsReset = () => this.onPositionsReset();

        room.onPlayerInputChange = (id: number) => {
            const player = convertPlayer(room.getPlayer(id));
            if (player) this.onPlayerActivity(player);
        };

        room.onStadiumChange = (stadium: { name: string }, byId: number) =>
            this.onStadiumChange(
                stadium.name,
                convertPlayer(room.getPlayer(byId)),
            );

        room.onRoomLink = (link: string) => this.onRoomLink(link);

        room.onKickRateLimitChange = (
            min: number,
            rate: number,
            burst: number,
            byId: number,
        ) =>
            this.onKickRateLimitSet(
                min,
                rate,
                burst,
                convertPlayer(room.getPlayer(byId)),
            );

        room.onTeamsLockChange = (value: boolean, byId: number) =>
            this.onTeamsLockChange(value, convertPlayer(room.getPlayer(byId)));

        room.onBeforeOperationReceived = (type: number, message: unknown) => {
            if (
                this.onBeforeOperation(
                    createRoomOperation(room, type, message),
                ) === false
            ) {
                return false;
            }

            if (
                type === haxball.OperationType.SendChat &&
                isChatOperation(message)
            ) {
                if (message.byId === 0) return true;
                const player = convertPlayer(room.getPlayer(message.byId));
                return player
                    ? this.onPlayerChat(player, message.text) !== false
                    : true;
            }

            if (
                type === haxball.OperationType.KickBanPlayer &&
                isKickBanOperation(message) &&
                message.reason !== null &&
                message.byId !== 0
            ) {
                const byPlayer = convertPlayer(room.getPlayer(message.byId));
                if (!byPlayer) return true;

                return (
                    this.onBeforeKick(
                        convertPlayer(room.getPlayer(message.id)),
                        message.reason,
                        message.ban,
                        byPlayer,
                    ) !== false
                );
            }

            return true;
        };
    }

    private afterTick(callback: () => void, ticks = 1): void {
        haxball.Utils.runAfterGameTick(callback, ticks);
    }

    public cancel(): void {
        this.cancelCreation?.();
        this.nativeRoom?.leave();
    }

    public useRecaptchaToken(token: string): void {
        this.sendRecaptchaToken?.(token);
    }

    public sendChat(message: string, targetId?: number | null): void {
        this.afterTick(() => this.room.sendChat(message, targetId ?? null));
    }

    public setPlayerAdmin(playerId: number, admin: boolean): void {
        this.afterTick(() => this.room.setPlayerAdmin(playerId, admin));
    }

    public setPlayerTeam(playerId: number, team: TeamID): void {
        this.afterTick(() => this.room.setPlayerTeam(playerId, team));
    }

    public kickPlayer(
        playerId: number,
        reason: string | null,
        ban: boolean,
    ): void {
        this.afterTick(() => this.room.kickPlayer(playerId, reason, ban));
    }

    public clearBan(playerId: number): void {
        this.room.clearBan(playerId);
    }

    public clearBans(): void {
        this.room.clearBans();
    }

    public setScoreLimit(limit: number): void {
        this.afterTick(() => this.room.setScoreLimit(limit));
    }

    public setTimeLimit(limit: number): void {
        this.afterTick(() => this.room.setTimeLimit(limit));
    }

    public setCustomStadium(stadiumFileContents: string): void {
        this.afterTick(() => {
            const stadium = haxball.Utils.parseStadium(stadiumFileContents);
            if (!stadium) {
                throw new Error("Invalid stadium");
            }

            this.room.setCurrentStadium(stadium);
        });
    }

    public setDefaultStadium(stadiumName: DefaultStadiums): void {
        this.afterTick(() => {
            const stadium = haxball.Utils.getDefaultStadiums().find(
                (entry: { name: string }) => entry.name === stadiumName,
            );

            if (!stadium) {
                throw new Error("Stadium doesn't exist");
            }

            this.room.setCurrentStadium(stadium);
        });
    }

    public setTeamsLock(locked: boolean): void {
        this.afterTick(() => {
            if (this.room.state.teamsLocked !== locked) this.room.lockTeams();
        });
    }

    public setTeamColors(
        team: TeamID,
        angle: number,
        textColor: number,
        colors: number[],
    ): void {
        this.afterTick(() =>
            this.room.setTeamColors(team, angle, textColor, ...colors),
        );
    }

    public startGame(): void {
        this.afterTick(() => this.room.startGame());
    }

    public stopGame(): void {
        this.afterTick(() => this.room.stopGame());
    }

    public pauseGame(pauseState: boolean): void {
        this.afterTick(() => {
            if (this.room.isGamePaused() !== pauseState) this.room.pauseGame();
        });
    }

    public getPlayer(playerId: number): PlayerObject | null {
        return convertPlayer(this.room.getPlayer(playerId));
    }

    public getPlayerList(): PlayerObject[] {
        return this.room.players
            .map(convertPlayer)
            .filter((player) => player !== null);
    }

    public getScores(): ScoresObject | null {
        return getScoresObject(this.room);
    }

    public getBallPosition(): Position | null {
        const ball = this.room.getBall();
        return ball ? { x: ball.pos.x, y: ball.pos.y } : null;
    }

    public startRecording(): void {
        this.room.startRecording();
    }

    public stopRecording(): Uint8Array | null {
        return this.room.stopRecording();
    }

    public setPassword(password: string | null): void {
        this.room.setProperties({ password });
    }

    public setRequireRecaptcha(required: boolean): void {
        this.room.requireRecaptcha = required;
    }

    public reorderPlayers(playerIdList: number[], moveToTop: boolean): void {
        this.afterTick(() => this.room.reorderPlayers(playerIdList, moveToTop));
    }

    public sendAnnouncement(
        msg: string,
        targetId?: number | null,
        color?: number | string | null,
        style?: ChatStyle,
        sound?: ChatSounds,
    ): void {
        const announcementColor = typeof color === "number" ? color : -1;
        this.afterTick(
            () =>
                this.room.sendAnnouncement(
                    msg,
                    targetId ?? null,
                    announcementColor,
                    style ?? "normal",
                    sound ?? 1,
                ),
            3,
        );
    }

    public setKickRateLimit(min = 2, rate = 0, burst = 0): void {
        this.afterTick(() => this.room.setKickRateLimit(min, rate, burst));
    }

    public setPlayerAvatar(playerId: number, avatar: string | null): void {
        this.afterTick(() => this.room.setPlayerAvatar(playerId, avatar, true));
    }

    public setDiscProperties(
        discIndex: number,
        properties: DiscPropertiesObject,
    ): void {
        this.afterTick(() =>
            this.room.setDiscProperties(discIndex, properties),
        );
    }

    public getDiscProperties(discIndex: number): DiscPropertiesObject | null {
        return getDiscPropertiesObject(this.room.getDisc(discIndex));
    }

    public setPlayerDiscProperties(
        playerId: number,
        properties: DiscPropertiesObject,
    ): void {
        this.afterTick(() =>
            this.room.setPlayerDiscProperties(playerId, properties),
        );
    }

    public getPlayerDiscProperties(
        playerId: number,
    ): DiscPropertiesObject | null {
        return getDiscPropertiesObject(this.room.getPlayer(playerId)?.disc);
    }

    public getDiscCount(): number {
        return this.room.gameState?.physicsState.discs.length ?? 0;
    }

    public get isHost() {
        return this.room.isHost;
    }

    public get currentPlayerId() {
        return this.room.currentPlayerId;
    }

    public get currentPlayer() {
        return this.room.currentPlayer;
    }

    public get state() {
        return this.room.state;
    }

    public get stateExt() {
        return this.room.stateExt;
    }

    public get gameState() {
        return this.room.gameState;
    }

    public get gameStateExt() {
        return this.room.gameStateExt;
    }

    public get sdp() {
        return this.room.sdp;
    }

    public get config() {
        return this.room.config;
    }

    public get renderer() {
        return this.room.renderer;
    }

    public get plugins() {
        return this.room.plugins;
    }

    public get pluginsMap() {
        return this.room.pluginsMap;
    }

    public get libraries() {
        return this.room.libraries;
    }

    public get librariesMap() {
        return this.room.librariesMap;
    }

    public get name() {
        return this.room.name;
    }

    public get link() {
        return this.room.link;
    }

    public get timeLimit() {
        return this.room.timeLimit;
    }

    public get scoreLimit() {
        return this.room.scoreLimit;
    }

    public get stadium() {
        return this.room.stadium;
    }

    public get players() {
        return this.room.players;
    }

    public get redScore() {
        return this.room.redScore;
    }

    public get blueScore() {
        return this.room.blueScore;
    }

    public get timeElapsed() {
        return this.room.timeElapsed;
    }

    public get currentFrameNo() {
        return this.room.currentFrameNo;
    }

    public get banList() {
        return this.room.banList;
    }

    public get password() {
        return this.room.password;
    }

    public get geo() {
        return this.room.geo;
    }

    public get maxPlayerCount() {
        return this.room.maxPlayerCount;
    }

    public get fakePassword() {
        return this.room.fakePassword;
    }

    public get fixedPlayerCount() {
        return this.room.fixedPlayerCount;
    }

    public get showInRoomList() {
        return this.room.showInRoomList;
    }

    public get unlimitedPlayerCount() {
        return this.room.unlimitedPlayerCount;
    }

    public get token() {
        return this.room.token;
    }

    public set token(value: string) {
        this.room.token = value;
    }

    public get requireRecaptcha() {
        return this.room.requireRecaptcha;
    }

    public set requireRecaptcha(value: boolean) {
        this.room.requireRecaptcha = value;
    }

    public get debugDesync() {
        return this.room.debugDesync;
    }

    public set debugDesync(value) {
        this.room.debugDesync = value;
    }

    public leave(): void {
        this.room.leave();
    }

    public setProperties(properties: NodeHaxballSetRoomProperties): void {
        this.room.setProperties(properties);
    }

    public setHandicap(handicap: number): void {
        this.room.setHandicap(handicap);
    }

    public addPlayerBan(playerId: number): NodeHaxballBanEntryId | null {
        return this.room.addPlayerBan(playerId);
    }

    public addIpBan(
        ...ips: NodeHaxballIpBanTarget[]
    ): Array<NodeHaxballBanEntryId | null> {
        return this.room.addIpBan(...ips);
    }

    public addAuthBan(...auths: string[]): Array<NodeHaxballBanEntryId | null> {
        return this.room.addAuthBan(...auths);
    }

    public removeBan(id: NodeHaxballBanEntryId): boolean {
        return this.room.removeBan(id);
    }

    public executeEvent(event: NodeHaxballHaxballEvent, byId: number): void {
        this.room.executeEvent(event, byId);
    }

    public executeEventWithTarget(
        event: NodeHaxballHaxballEvent,
        targetId: number,
    ): void {
        this.room.executeEventWithTarget(event, targetId);
    }

    public clearEvents(): void {
        this.room.clearEvents();
    }

    public setAvatar(avatar: string): void {
        this.room.setAvatar(avatar);
    }

    public setChatIndicatorActive(active: boolean): void {
        this.room.setChatIndicatorActive(active);
    }

    public setUnlimitedPlayerCount(on: boolean): void {
        this.room.setUnlimitedPlayerCount(on);
    }

    public setFakePassword(fakePassword: boolean | null): void {
        this.room.setFakePassword(fakePassword);
    }

    public sendCustomEvent(
        type: number,
        data: object,
        targetId?: number,
    ): void {
        this.room.sendCustomEvent(type, data, targetId);
    }

    public sendBinaryCustomEvent(
        type: number,
        data: Uint8Array,
        targetId?: number,
    ): void {
        this.room.sendBinaryCustomEvent(type, data, targetId);
    }

    public setPlayerIdentity(
        playerId: number,
        data: object,
        targetId?: number,
    ): void {
        this.room.setPlayerIdentity(playerId, data, targetId);
    }

    public getKeyState(): number {
        return this.room.getKeyState();
    }

    public setKeyState(state: number, instant = true): void {
        this.room.setKeyState(state, instant);
    }

    public isGamePaused(): boolean {
        return this.room.isGamePaused();
    }

    public autoTeams(): void {
        this.room.autoTeams();
    }

    public changeTeam(teamId: TeamID): void {
        this.room.changeTeam(teamId);
    }

    public resetTeam(teamId: TeamID): void {
        this.room.resetTeam(teamId);
    }

    public resetTeams(): void {
        this.room.resetTeams();
    }

    public randTeams(): void {
        this.room.randTeams();
    }

    public setSync(value: boolean): void {
        this.room.setSync(value);
    }

    public setCurrentStadium(stadium: NodeHaxballStadium): void {
        this.room.setCurrentStadium(stadium);
    }

    public getBall(extrapolated = false) {
        return this.room.getBall(extrapolated);
    }

    public getDiscs(extrapolated = false) {
        return this.room.getDiscs(extrapolated);
    }

    public getDisc(discId: number, extrapolated = false) {
        return this.room.getDisc(discId, extrapolated);
    }

    public getPlayerDisc(playerId: number, extrapolated = false) {
        return this.room.getPlayerDisc(playerId, extrapolated);
    }

    public getPlayerDisc_exp(playerId: number) {
        return this.room.getPlayerDisc_exp(playerId);
    }

    public setPluginActive(name: string, active: boolean): void {
        this.room.setPluginActive(name, active);
    }

    public startStreaming(
        params: NodeHaxballStartStreamingParams,
    ): NodeHaxballStartStreamingReturnValue | null {
        return this.room.startStreaming(params);
    }

    public stopStreaming(): void {
        this.room.stopStreaming();
    }

    public isRecording(): boolean {
        return this.room.isRecording();
    }

    public extrapolate(milliseconds: number, ignoreMultipleCalls = false) {
        return this.room.extrapolate(milliseconds, ignoreMultipleCalls);
    }

    public setConfig(roomConfig: NodeHaxballRoomConfig): void {
        this.room.setConfig(roomConfig);
    }

    public mixConfig(roomConfig: NodeHaxballRoomConfig): void {
        this.room.mixConfig(roomConfig);
    }

    public addPlugin(plugin: NodeHaxballPlugin): void {
        this.room.addPlugin(plugin);
    }

    public movePlugin(pluginIndex: number, newIndex: number): void {
        this.room.movePlugin(pluginIndex, newIndex);
    }

    public updatePlugin(pluginIndex: number, plugin: NodeHaxballPlugin): void {
        this.room.updatePlugin(pluginIndex, plugin);
    }

    public removePlugin(plugin: NodeHaxballPlugin): void {
        this.room.removePlugin(plugin);
    }

    public setRenderer(renderer: NodeHaxballRenderer): void {
        this.room.setRenderer(renderer);
    }

    public addLibrary(library: NodeHaxballLibrary): void {
        this.room.addLibrary(library);
    }

    public moveLibrary(libraryIndex: number, newIndex: number): void {
        this.room.moveLibrary(libraryIndex, newIndex);
    }

    public updateLibrary(
        libraryIndex: number,
        library: NodeHaxballLibrary,
    ): void {
        this.room.updateLibrary(libraryIndex, library);
    }

    public removeLibrary(library: NodeHaxballLibrary): void {
        this.room.removeLibrary(library);
    }

    public takeSnapshot() {
        return this.room.takeSnapshot();
    }

    public fakePlayerJoin(
        id: number,
        name: string,
        flag: string,
        avatar: string,
        conn: string,
        auth: string,
    ): void {
        this.room.fakePlayerJoin(id, name, flag, avatar, conn, auth);
    }

    public getPlayerIdentity(playerId: number): PlayerIdentityObject | null {
        const player = this.room.getPlayer(playerId);

        if (!player) {
            return null;
        }

        return {
            id: player.id,
            name: player.name,
            flag: player.flag,
            avatar: player.avatar ?? "",
            conn: player.conn ?? "",
            auth: player.auth ?? "",
        };
    }

    public sendPlayerJoinTo(
        identity: PlayerIdentityObject,
        targetId: number,
    ): void {
        this.room.executeEventWithTarget(
            createHostEvent(
                haxball.EventFactory.joinRoom(
                    identity.id,
                    identity.name,
                    identity.flag,
                    identity.avatar,
                    identity.conn,
                    identity.auth,
                ),
            ),
            targetId,
        );
    }

    public sendPlayerLeaveTo(playerId: number, targetId: number): void {
        this.room.executeEventWithTarget(
            createHostEvent(
                haxball.EventFactory.kickBanPlayer(
                    playerId,
                    null as unknown as string,
                    false,
                ),
            ),
            targetId,
        );
    }

    public fakePlayerLeave(id: number) {
        return this.room.fakePlayerLeave(id);
    }

    public fakeSendPlayerInput(input: number, byId: number): void {
        this.room.fakeSendPlayerInput(input, byId);
    }

    public fakeSendPlayerChat(message: string, byId: number): void {
        this.room.fakeSendPlayerChat(message, byId);
    }

    public fakeSetPlayerChatIndicator(value: boolean, byId: number): void {
        this.room.fakeSetPlayerChatIndicator(value, byId);
    }

    public fakeSetPlayerAvatar(value: string, byId: number): void {
        this.room.fakeSetPlayerAvatar(value, byId);
    }

    public fakeSetPlayerAdmin(
        playerId: number,
        value: boolean,
        byId: number,
    ): void {
        this.room.fakeSetPlayerAdmin(playerId, value, byId);
    }

    public fakeSetPlayerSync(value: boolean, byId: number): void {
        this.room.fakeSetPlayerSync(value, byId);
    }

    public fakeSetStadium(stadium: NodeHaxballStadium, byId: number): void {
        this.room.fakeSetStadium(stadium, byId);
    }

    public fakeStartGame(byId: number): void {
        this.room.fakeStartGame(byId);
    }

    public fakeStopGame(byId: number): void {
        this.room.fakeStopGame(byId);
    }

    public fakeSetGamePaused(value: boolean, byId: number): void {
        this.room.fakeSetGamePaused(value, byId);
    }

    public fakeSetScoreLimit(value: number, byId: number): void {
        this.room.fakeSetScoreLimit(value, byId);
    }

    public fakeSetTimeLimit(value: number, byId: number): void {
        this.room.fakeSetTimeLimit(value, byId);
    }

    public fakeSetTeamsLock(value: boolean, byId: number): void {
        this.room.fakeSetTeamsLock(value, byId);
    }

    public fakeAutoTeams(byId: number): void {
        this.room.fakeAutoTeams(byId);
    }

    public fakeSetPlayerTeam(
        playerId: number,
        teamId: TeamID,
        byId: number,
    ): void {
        this.room.fakeSetPlayerTeam(playerId, teamId, byId);
    }

    public fakeSetKickRateLimit(
        min: number,
        rate: number,
        burst: number,
        byId: number,
    ): void {
        this.room.fakeSetKickRateLimit(min, rate, burst, byId);
    }

    public fakeSetTeamColors(
        teamId: TeamID,
        angle: number,
        colors: number[],
        byId: number,
    ): void {
        this.room.fakeSetTeamColors(teamId, angle, colors, byId);
    }

    public fakeKickPlayer(
        playerId: number,
        reason: string | null,
        ban: boolean,
        byId: number,
    ): void {
        this.room.fakeKickPlayer(playerId, reason, ban, byId);
    }
}

function HBInit(config: RoomConfigObject): HaxballCompatibilityRoom {
    const room = new HaxballCompatibilityRoom();

    room.open(config).catch((error) => {
        console.error("Failed to open node-haxball room:", error);
    });

    return room;
}

export default Promise.resolve(HBInit);
