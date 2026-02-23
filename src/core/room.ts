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

const DEFAULT_STADIUM_NAMES = [
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
] as const;

type DefaultStadiumName = (typeof DEFAULT_STADIUM_NAMES)[number];

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

    return JSON.parse(JSON.stringify(stadium)) as StadiumObject;
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

    public setAvatar(player: PlayerObject, avatar: string | null): void;
    public setAvatar(playerId: number, avatar: string | null): void;
    public setAvatar(
        player: number | PlayerObject,
        avatar: string | null,
    ): void {
        const playerId = typeof player === "number" ? player : player.id;
        this.room.setPlayerAvatar(playerId, avatar);
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
