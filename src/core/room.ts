import { StadiumObject } from "@haxball/stadium";

type TeamTarget = "teams" | "red" | "blue";
type ObjectWithId = { id: number };
type AnnouncementTargetFilter = (player: PlayerObject) => boolean;

export type AnnouncementTarget =
    | number
    | null
    | TeamTarget
    | "mixed"
    | ObjectWithId
    | number[]
    | ObjectWithId[]
    | AnnouncementTargetFilter;

export type AnnouncementOptions = {
    message: string;
    to?: AnnouncementTarget;
    color?: number | null;
    style?: ChatStyle;
    sound?: ChatSoundString;
};

export type RegisteredCommand = {
    name: string;
    aliases: string[];
    category: string;
    description?: string;
};

type DefaultStadiumName =
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

const DEFAULT_STADIUM_NAMES: readonly DefaultStadiumName[] = [
    "Classic",
    "Easy",
    "Small",
    "Big",
    "Rounded",
    "Hockey",
    "BigHockey",
    "BigEasy",
    "BigRounded",
    "Huge",
];

const DEFAULT_STADIUM_NAME_SET = new Set<string>(DEFAULT_STADIUM_NAMES);

const isDefaultStadiumName = (
    stadiumName: string,
): stadiumName is DefaultStadiumName =>
    DEFAULT_STADIUM_NAME_SET.has(stadiumName);

type TrackedStadium =
    | { kind: "default"; name: DefaultStadiumName }
    | { kind: "custom"; stadium: StadiumObject }
    | { kind: "named"; name: string };

const cloneStadiumObject = (stadium: StadiumObject): StadiumObject => {
    if (typeof globalThis.structuredClone === "function") {
        return globalThis.structuredClone(stadium);
    }

    return JSON.parse(JSON.stringify(stadium));
};

const cloneTrackedStadium = (stadium: TrackedStadium): TrackedStadium => {
    if (stadium.kind === "custom") {
        return {
            kind: "custom",
            stadium: cloneStadiumObject(stadium.stadium),
        };
    }

    return { ...stadium };
};

const getTrackedStadiumName = (stadium: TrackedStadium): string => {
    switch (stadium.kind) {
        case "default":
        case "named":
            return stadium.name;
        case "custom":
            return stadium.stadium.name ?? "Custom";
    }
};

export class Room {
    private playerListCache: PlayerObject[] | null = null;
    private discPropsCache = new Map<number, DiscPropertiesObject | null>();
    private playerDiscPropsCache = new Map<
        number,
        DiscPropertiesObject | null
    >();
    private currentStadium: TrackedStadium | null = null;
    private previousStadium: TrackedStadium | null = null;
    private pendingStadiumName: string | null = null;
    private registeredCommands: RegisteredCommand[] = [];

    constructor(private room: RoomObject) {}

    private setTrackedStadium(nextStadium: TrackedStadium): void {
        this.previousStadium = this.currentStadium
            ? cloneTrackedStadium(this.currentStadium)
            : null;
        this.currentStadium = cloneTrackedStadium(nextStadium);
        this.pendingStadiumName = getTrackedStadiumName(nextStadium);
    }

    private invalidateAllCaches() {
        this.playerListCache = null;
        this.discPropsCache.clear();
        this.playerDiscPropsCache.clear();
    }

    private invalidatePlayerListCache() {
        this.playerListCache = null;
    }

    private invalidateDiscCache(discIndex?: number) {
        if (typeof discIndex === "number") {
            this.discPropsCache.delete(discIndex);
        } else {
            this.discPropsCache.clear();
        }
    }

    private invalidatePlayerDiscCache(playerId?: number) {
        if (typeof playerId === "number") {
            this.playerDiscPropsCache.delete(playerId);
        } else {
            this.playerDiscPropsCache.clear();
        }
    }

    public invalidateCaches(): void {
        this.invalidateAllCaches();
    }

    public setCommands(commands: RegisteredCommand[]): void {
        this.registeredCommands = commands.map((command) => ({
            name: command.name,
            aliases: [...command.aliases],
            category: command.category,
            ...(command.description
                ? { description: command.description }
                : {}),
        }));
    }

    public getCommands(): RegisteredCommand[] {
        return this.registeredCommands.map((command) => ({
            name: command.name,
            aliases: [...command.aliases],
            category: command.category,
            ...(command.description
                ? { description: command.description }
                : {}),
        }));
    }

    public send({
        message,
        color = null,
        to,
        style = "normal",
        sound = "normal",
    }: AnnouncementOptions): void {
        if (typeof to === "function") {
            this.getPlayerList()
                .filter((player) => to(player))
                .forEach((player) => {
                    this.room.sendAnnouncement(
                        message,
                        player.id,
                        color,
                        style,
                        toChatSound(sound),
                    );
                });

            return;
        }

        if (to === "mixed") {
            this.getPlayerList().forEach((player) => {
                const isTeamPlayer = player.team === 1 || player.team === 2;

                this.room.sendAnnouncement(
                    message,
                    player.id,
                    color,
                    isTeamPlayer ? style : "normal",
                    toChatSound(isTeamPlayer ? sound : "normal"),
                );
            });

            return;
        }

        if (to === "teams" || to === "red" || to === "blue") {
            const teamIds: TeamID[] =
                to === "teams" ? [1, 2] : to === "red" ? [1] : [2];

            this.getPlayerList()
                .filter((player) => teamIds.includes(player.team))
                .forEach((player) => {
                    this.room.sendAnnouncement(
                        message,
                        player.id,
                        color,
                        style,
                        toChatSound(sound),
                    );
                });

            return;
        }

        if (Array.isArray(to)) {
            const ids = to.map((entry) =>
                typeof entry === "number" ? entry : entry.id,
            );

            for (const id of ids) {
                this.room.sendAnnouncement(
                    message,
                    id,
                    color,
                    style,
                    toChatSound(sound),
                );
            }

            return;
        }

        if (typeof to === "object" && to !== null) {
            this.room.sendAnnouncement(
                message,
                to.id,
                color,
                style,
                toChatSound(sound),
            );

            return;
        }

        this.room.sendAnnouncement(
            message,
            to ?? null,
            color,
            style,
            toChatSound(sound),
        );
    }

    public chat(message: string, to?: number | null): void {
        this.room.sendChat(message, to);
    }

    public setAdmin(player: PlayerObject, admin: boolean): void;
    public setAdmin(playerId: number, admin: boolean): void;
    public setAdmin(player: number | PlayerObject, admin: boolean): void {
        const playerId = typeof player === "number" ? player : player.id;
        this.room.setPlayerAdmin(playerId, admin);
        this.invalidatePlayerListCache();
    }

    public setTeam(player: PlayerObject, team: TeamID): void;
    public setTeam(playerId: number, team: TeamID): void;
    public setTeam(player: number | PlayerObject, team: TeamID): void {
        const playerId = typeof player === "number" ? player : player.id;
        this.room.setPlayerTeam(playerId, team);
        this.invalidatePlayerListCache();
    }

    public kick(player: PlayerObject, reason?: string): void;
    public kick(player: number, reason?: string): void;
    public kick(player: number | PlayerObject, reason = ""): void {
        const playerId = typeof player === "number" ? player : player.id;
        this.room.kickPlayer(playerId, reason, false);
        this.invalidateCaches();
    }

    public ban(player: PlayerObject, reason?: string): void;
    public ban(player: number, reason?: string): void;
    public ban(player: number | PlayerObject, reason = ""): void {
        const playerId = typeof player === "number" ? player : player.id;
        this.room.kickPlayer(playerId, reason, true);
        this.invalidateCaches();
    }

    public clearBan(playerId: number): void {
        this.room.clearBan(playerId);
        this.invalidateCaches();
    }

    public clearBans(): void {
        this.room.clearBans();
        this.invalidateCaches();
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

    public removeBan(banId: NodeHaxballBanEntryId): boolean {
        return this.room.removeBan(banId);
    }

    public getPlayer(playerId: number): PlayerObject | null {
        return this.room.getPlayer(playerId);
    }

    public getPlayerList(): PlayerObject[] {
        if (!this.playerListCache) {
            this.playerListCache = this.room.getPlayerList();
        }
        return this.playerListCache;
    }

    public reorderPlayers(
        playerIds: number[],
        moveToTop: boolean = true,
    ): void {
        this.room.reorderPlayers(playerIds, moveToTop);
        this.invalidatePlayerListCache();
    }

    public setAvatar(avatar: string): void;
    public setAvatar(player: PlayerObject, avatar: string | null): void;
    public setAvatar(playerId: number, avatar: string | null): void;
    public setAvatar(
        playerOrAvatar: number | PlayerObject | string,
        avatar?: string | null,
    ): void {
        if (typeof playerOrAvatar === "string" && arguments.length === 1) {
            this.room.setAvatar(playerOrAvatar);
            return;
        }

        if (typeof playerOrAvatar === "string") {
            this.room.setAvatar(playerOrAvatar);
            return;
        }

        const playerId =
            typeof playerOrAvatar === "number"
                ? playerOrAvatar
                : playerOrAvatar.id;
        this.room.setPlayerAvatar(playerId, avatar ?? null);
        this.invalidatePlayerListCache();
    }

    public startGame(): void {
        this.room.startGame();
        this.invalidateCaches();
    }

    public stopGame(): void {
        this.room.stopGame();
        this.invalidateCaches();
    }

    public pauseGame(paused: boolean = true): void {
        this.room.pauseGame(paused);
        this.invalidateCaches();
    }

    public unpauseGame(): void {
        this.room.pauseGame(false);
        this.invalidateCaches();
    }

    public getScores(): ScoresObject | null {
        return this.room.getScores();
    }

    public setScoreLimit(limit: number): void {
        this.room.setScoreLimit(limit);
    }

    public setTimeLimit(limitInMinutes: number): void {
        this.room.setTimeLimit(limitInMinutes);
    }

    public setStadium(stadiumFileContents: StadiumObject): void {
        this.setTrackedStadium({
            kind: "custom",
            stadium: stadiumFileContents,
        });
        this.room.setCustomStadium(JSON.stringify(stadiumFileContents));
        this.invalidateCaches();
    }

    public setDefaultStadium(stadiumName: DefaultStadiumName): void {
        this.setTrackedStadium({
            kind: "default",
            name: stadiumName,
        });
        this.room.setDefaultStadium(stadiumName);
        this.invalidateCaches();
    }

    public trackStadiumChange(stadiumName: string): void {
        if (
            this.pendingStadiumName !== null &&
            this.pendingStadiumName === stadiumName
        ) {
            this.pendingStadiumName = null;
            return;
        }

        this.pendingStadiumName = null;
        this.previousStadium = this.currentStadium
            ? cloneTrackedStadium(this.currentStadium)
            : null;
        this.currentStadium = isDefaultStadiumName(stadiumName)
            ? { kind: "default", name: stadiumName }
            : { kind: "named", name: stadiumName };
    }

    public undoStadiumChange(): boolean {
        if (!this.previousStadium) return false;

        const targetStadium = cloneTrackedStadium(this.previousStadium);
        const currentStadium = this.currentStadium
            ? cloneTrackedStadium(this.currentStadium)
            : null;

        switch (targetStadium.kind) {
            case "custom":
                this.pendingStadiumName = getTrackedStadiumName(targetStadium);
                this.room.setCustomStadium(
                    JSON.stringify(targetStadium.stadium),
                );
                break;
            case "default":
                this.pendingStadiumName = targetStadium.name;
                this.room.setDefaultStadium(targetStadium.name);
                break;
            case "named":
                if (!isDefaultStadiumName(targetStadium.name)) {
                    return false;
                }

                this.pendingStadiumName = targetStadium.name;
                this.room.setDefaultStadium(targetStadium.name);
                break;
        }

        this.currentStadium = targetStadium;
        this.previousStadium = currentStadium;
        this.invalidateCaches();

        return true;
    }

    public setTeamsLock(locked: boolean): void {
        this.room.setTeamsLock(locked);
        this.invalidatePlayerListCache();
    }

    public lockTeams(): void {
        this.setTeamsLock(true);
    }

    public unlockTeams(): void {
        this.setTeamsLock(false);
    }

    public setTeamColors(
        team: TeamID,
        angle: number,
        textColor: number,
        colors: number[],
    ): void {
        this.room.setTeamColors(team, angle, textColor, colors);
    }

    public setPassword(password: string | null): void {
        this.room.setPassword(password);
    }

    public removePassword(): void {
        this.room.setPassword(null);
    }

    public setRequireRecaptcha(required: boolean): void {
        this.room.setRequireRecaptcha(required);
    }

    public setProperties(properties: NodeHaxballSetRoomProperties): void {
        this.room.setProperties(properties);
        this.invalidateCaches();
    }

    public setKickRateLimit(min: number, rate: number, burst: number): void {
        this.room.setKickRateLimit(min, rate, burst);
    }

    public getBallPosition(): Position | null {
        return this.room.getBallPosition();
    }

    public getDiscCount(): number {
        return this.room.getDiscCount();
    }

    public getDiscProperties(discIndex: number): DiscPropertiesObject | null {
        if (this.discPropsCache.has(discIndex)) {
            return this.discPropsCache.get(discIndex) ?? null;
        }

        const value = this.room.getDiscProperties(discIndex);
        this.discPropsCache.set(discIndex, value);
        return value;
    }

    public setDiscProperties(
        discIndex: number,
        properties: DiscPropertiesObject,
    ): void {
        this.room.setDiscProperties(discIndex, properties);
        this.invalidateDiscCache(discIndex);
    }

    public getPlayerDiscProperties(
        player: PlayerObject,
    ): DiscPropertiesObject | null;
    public getPlayerDiscProperties(
        playerId: number,
    ): DiscPropertiesObject | null;
    public getPlayerDiscProperties(
        player: number | PlayerObject,
    ): DiscPropertiesObject | null {
        const playerId = typeof player === "number" ? player : player.id;
        if (this.playerDiscPropsCache.has(playerId)) {
            return this.playerDiscPropsCache.get(playerId) ?? null;
        }

        const value = this.room.getPlayerDiscProperties(playerId);
        this.playerDiscPropsCache.set(playerId, value);
        return value;
    }

    public setPlayerDiscProperties(
        player: PlayerObject,
        properties: DiscPropertiesObject,
    ): void;
    public setPlayerDiscProperties(
        playerId: number,
        properties: DiscPropertiesObject,
    ): void;
    public setPlayerDiscProperties(
        player: number | PlayerObject,
        properties: DiscPropertiesObject,
    ): void {
        const playerId = typeof player === "number" ? player : player.id;
        this.room.setPlayerDiscProperties(playerId, properties);
        this.invalidatePlayerDiscCache(playerId);
    }

    public startRecording(): void {
        this.room.startRecording();
    }

    public stopRecording(): Uint8Array | null {
        return this.room.stopRecording();
    }

    public executeEvent(event: NodeHaxballHaxballEvent, byId: number): void {
        this.room.executeEvent(event, byId);
        this.invalidateCaches();
    }

    public executeEventWithTarget(
        event: NodeHaxballHaxballEvent,
        targetId: number,
    ): void {
        this.room.executeEventWithTarget(event, targetId);
        this.invalidateCaches();
    }

    public clearEvents(): void {
        this.room.clearEvents();
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

    public fakePlayerJoin(
        id: number,
        name: string,
        flag: string,
        avatar: string,
        conn: string,
        auth: string,
    ): void {
        this.room.fakePlayerJoin(id, name, flag, avatar, conn, auth);
        this.invalidatePlayerListCache();
    }

    public fakePlayerLeave(playerId: number): unknown {
        const player = this.room.fakePlayerLeave(playerId);
        this.invalidatePlayerListCache();
        return player;
    }

    public fakeKickPlayer(
        playerId: number,
        reason: string | null,
        ban: boolean,
        byId: number,
    ): void {
        this.room.fakeKickPlayer(playerId, reason, ban, byId);
        this.invalidateCaches();
    }

    public leave(): void {
        this.room.leave();
        this.invalidateCaches();
    }

    public setHandicap(handicap: number): void {
        this.room.setHandicap(handicap);
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

    public getKeyState(): number {
        return this.room.getKeyState();
    }

    public setKeyState(state: number, instant: boolean = true): void {
        this.room.setKeyState(state, instant);
    }

    public isGamePaused(): boolean {
        return this.room.isGamePaused();
    }

    public autoTeams(): void {
        this.room.autoTeams();
        this.invalidatePlayerListCache();
    }

    public changeTeam(teamId: TeamID): void {
        this.room.changeTeam(teamId);
        this.invalidatePlayerListCache();
    }

    public resetTeam(teamId: TeamID): void {
        this.room.resetTeam(teamId);
        this.invalidatePlayerListCache();
    }

    public resetTeams(): void {
        this.room.resetTeams();
        this.invalidatePlayerListCache();
    }

    public randTeams(): void {
        this.room.randTeams();
        this.invalidatePlayerListCache();
    }

    public setSync(value: boolean): void {
        this.room.setSync(value);
    }

    public setCurrentStadium(stadium: NodeHaxballStadium): void {
        this.room.setCurrentStadium(stadium);
        this.invalidateCaches();
    }

    public getBall(extrapolated: boolean = false): NodeHaxballDisc {
        return this.room.getBall(extrapolated);
    }

    public getDiscs(extrapolated: boolean = false): NodeHaxballDisc[] {
        return this.room.getDiscs(extrapolated);
    }

    public getDisc(
        discId: number,
        extrapolated: boolean = false,
    ): NodeHaxballDisc {
        return this.room.getDisc(discId, extrapolated);
    }

    public getPlayerDisc(
        playerId: number,
        extrapolated: boolean = false,
    ): NodeHaxballDisc {
        return this.room.getPlayerDisc(playerId, extrapolated);
    }

    public getPlayerDisc_exp(playerId: number): NodeHaxballDisc {
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

    public extrapolate(
        milliseconds: number,
        ignoreMultipleCalls: boolean = false,
    ): object {
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

    public takeSnapshot(): object {
        return this.room.takeSnapshot();
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
        this.invalidatePlayerListCache();
    }

    public fakeSetPlayerAdmin(
        playerId: number,
        value: boolean,
        byId: number,
    ): void {
        this.room.fakeSetPlayerAdmin(playerId, value, byId);
        this.invalidatePlayerListCache();
    }

    public fakeSetPlayerSync(value: boolean, byId: number): void {
        this.room.fakeSetPlayerSync(value, byId);
    }

    public fakeSetStadium(stadium: NodeHaxballStadium, byId: number): void {
        this.room.fakeSetStadium(stadium, byId);
        this.invalidateCaches();
    }

    public fakeStartGame(byId: number): void {
        this.room.fakeStartGame(byId);
        this.invalidateCaches();
    }

    public fakeStopGame(byId: number): void {
        this.room.fakeStopGame(byId);
        this.invalidateCaches();
    }

    public fakeSetGamePaused(value: boolean, byId: number): void {
        this.room.fakeSetGamePaused(value, byId);
        this.invalidateCaches();
    }

    public fakeSetScoreLimit(value: number, byId: number): void {
        this.room.fakeSetScoreLimit(value, byId);
    }

    public fakeSetTimeLimit(value: number, byId: number): void {
        this.room.fakeSetTimeLimit(value, byId);
    }

    public fakeSetTeamsLock(value: boolean, byId: number): void {
        this.room.fakeSetTeamsLock(value, byId);
        this.invalidatePlayerListCache();
    }

    public fakeAutoTeams(byId: number): void {
        this.room.fakeAutoTeams(byId);
        this.invalidatePlayerListCache();
    }

    public fakeSetPlayerTeam(
        playerId: number,
        teamId: TeamID,
        byId: number,
    ): void {
        this.room.fakeSetPlayerTeam(playerId, teamId, byId);
        this.invalidatePlayerListCache();
        this.invalidatePlayerDiscCache(playerId);
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

    public get collisionFlags(): CollisionFlagsObject {
        return this.room.CollisionFlags;
    }

    public get raw(): RoomObject {
        return this.room;
    }
}

function toChatSound(sound: ChatSoundString): ChatSounds {
    switch (sound) {
        case "none":
            return 0;
        case "normal":
            return 1;
        case "notification":
            return 2;
    }
}
