import {
    CommandConfig,
    CommandResponse,
    CommandSpec,
    NormalizedCommandConfig,
    buildCommandCatalog,
    normalizeCommandConfig,
    normalizeCommandToken,
    parseCommandMessage,
} from "@core/commands";
import { Room } from "@core/room";

export type StadiumChangeHandlerResponse = {
    undo?: boolean;
};

export class Module {
    private events: [string, Function][] = [];
    private commandConfig: NormalizedCommandConfig | null = null;

    setCommands(config: CommandConfig): this {
        this.commandConfig = normalizeCommandConfig(config);

        return this;
    }

    getCommandConfig(): NormalizedCommandConfig | null {
        return this.commandConfig;
    }

    handlesCommand(commandName: string): boolean {
        return this.commandConfig
            ? this.commandConfig.entries.has(normalizeCommandToken(commandName))
            : false;
    }

    onPlayerJoin(handler: (room: Room, player: PlayerObject) => void): this {
        this.events.push(["onPlayerJoin", handler]);
        return this;
    }

    onPlayerLeave(handler: (room: Room, player: PlayerObject) => void): this {
        this.events.push(["onPlayerLeave", handler]);
        return this;
    }

    onTeamVictory(handler: (room: Room, scores: ScoresObject) => void): this {
        this.events.push(["onTeamVictory", handler]);
        return this;
    }

    onPlayerChat(
        handler: (
            room: Room,
            player: PlayerObject,
            message: string,
        ) => boolean | void,
    ): this {
        this.events.push(["onPlayerChat", handler]);
        return this;
    }

    onPlayerSendCommand(
        handler: (
            room: Room,
            player: PlayerObject,
            command: CommandSpec,
        ) => CommandResponse | void,
    ): this {
        this.events.push(["onPlayerSendCommand", handler]);
        return this;
    }

    onPlayerBallKick(
        handler: (room: Room, player: PlayerObject) => void,
    ): this {
        this.events.push(["onPlayerBallKick", handler]);
        return this;
    }

    onTeamGoal(handler: (room: Room, team: TeamID) => void): this {
        this.events.push(["onTeamGoal", handler]);
        return this;
    }

    onGameStart(
        handler: (room: Room, byPlayer: PlayerObject | null) => void,
    ): this {
        this.events.push(["onGameStart", handler]);
        return this;
    }

    onGameStop(
        handler: (room: Room, byPlayer: PlayerObject | null) => void,
    ): this {
        this.events.push(["onGameStop", handler]);
        return this;
    }

    onPlayerAdminChange(
        handler: (
            room: Room,
            changedPlayer: PlayerObject,
            byPlayer: PlayerObject | null,
        ) => void,
    ): this {
        this.events.push(["onPlayerAdminChange", handler]);
        return this;
    }

    onPlayerTeamChange(
        handler: (
            room: Room,
            changedPlayer: PlayerObject,
            byPlayer: PlayerObject | null,
        ) => void,
    ): this {
        this.events.push(["onPlayerTeamChange", handler]);
        return this;
    }

    onBeforeKick(
        handler: (
            room: Room,
            kickedPlayer: PlayerObject | null,
            reason: string,
            ban: boolean,
            byPlayer: PlayerObject,
        ) => boolean | void,
    ): this {
        this.events.push(["onBeforeKick", handler]);
        return this;
    }

    onPlayerKicked(
        handler: (
            room: Room,
            kickedPlayer: PlayerObject,
            reason: string,
            ban: boolean,
            byPlayer: PlayerObject | null,
        ) => void,
    ): this {
        this.events.push(["onPlayerKicked", handler]);
        return this;
    }

    onGameTick(handler: (room: Room) => void): this {
        this.events.push(["onGameTick", handler]);
        return this;
    }

    onGamePause(
        handler: (room: Room, byPlayer: PlayerObject | null) => void,
    ): this {
        this.events.push(["onGamePause", handler]);
        return this;
    }

    onGameUnpause(
        handler: (room: Room, byPlayer: PlayerObject | null) => void,
    ): this {
        this.events.push(["onGameUnpause", handler]);
        return this;
    }

    onPositionsReset(handler: (room: Room) => void): this {
        this.events.push(["onPositionsReset", handler]);
        return this;
    }

    onPlayerActivity(
        handler: (room: Room, player: PlayerObject) => void,
    ): this {
        this.events.push(["onPlayerActivity", handler]);
        return this;
    }

    onStadiumChange(
        handler: (
            room: Room,
            newStadiumName: string,
            byPlayer: PlayerObject | null,
        ) => StadiumChangeHandlerResponse | void,
    ): this {
        this.events.push(["onStadiumChange", handler]);
        return this;
    }

    onRoomLink(handler: (room: Room, url: string) => void): this {
        this.events.push(["onRoomLink", handler]);
        return this;
    }

    onKickRateLimitSet(
        handler: (
            room: Room,
            min: number,
            rate: number,
            burst: number,
            byPlayer: PlayerObject | null,
        ) => void,
    ): this {
        this.events.push(["onKickRateLimitSet", handler]);
        return this;
    }

    call(eventName: string, ...args: any[]): boolean {
        for (const [name, handler] of this.events) {
            if (name === eventName) {
                const response = handler(...args);

                if (response === false) {
                    return false;
                }
            }
        }

        return true;
    }

    callWithResponses(eventName: string, ...args: any[]): unknown[] {
        const responses: unknown[] = [];

        for (const [name, handler] of this.events) {
            if (name !== eventName) continue;
            responses.push(handler(...args));
        }

        return responses;
    }

    callCommand(room: Room, player: PlayerObject, command: CommandSpec) {
        const responses: CommandResponse[] = [];

        for (const [name, handler] of this.events) {
            if (name === "onPlayerSendCommand") {
                const response = handler(room, player, command);

                if (response && typeof response === "object") {
                    responses.push(response as CommandResponse);
                }
            }
        }

        return responses;
    }
}

export function createModule() {
    return new Module();
}

export function updateRoomModules(roomObject: RoomObject, modules: Module[]) {
    const room = new Room(roomObject);
    let ignoreNextStadiumUndo = false;

    const commandConfigs = modules
        .map((module) => module.getCommandConfig())
        .filter((config): config is NormalizedCommandConfig => config !== null);

    const commandSpec = commandConfigs[0]?.spec ?? null;

    const hasCommandSpecMismatch =
        commandSpec !== null &&
        commandConfigs.some(
            (config) => config.spec.prefix !== commandSpec.prefix,
        );

    if (hasCommandSpecMismatch) {
        throw new Error(
            "All modules must use the same command prefix in setCommands.",
        );
    }

    const commandCatalog = buildCommandCatalog(commandConfigs);

    room.setCommands(commandCatalog.commands);

    const parseCommand = (message: string): CommandSpec | null =>
        parseCommandMessage({
            message,
            spec: commandSpec,
            tokens: commandCatalog.tokens,
        });

    const emit =
        (eventName: string) =>
        (...args: any[]) => {
            room.invalidateCaches();
            modules.forEach((module) => module.call(eventName, room, ...args));
        };

    const shouldUndoStadiumChange = (response: unknown): boolean => {
        if (!response || typeof response !== "object") return false;
        if (!("undo" in response)) return false;

        return (response as StadiumChangeHandlerResponse).undo === true;
    };

    const emitStadiumChange =
        () =>
        (...args: any[]) => {
            room.invalidateCaches();

            const newStadiumName = args[0] as string;
            const byPlayer = args[1] as PlayerObject | null;

            room.trackStadiumChange(newStadiumName);

            if (ignoreNextStadiumUndo) {
                ignoreNextStadiumUndo = false;
                return;
            }

            const responses = modules.flatMap((module) =>
                module.callWithResponses(
                    "onStadiumChange",
                    room,
                    newStadiumName,
                    byPlayer,
                ),
            );

            const shouldUndo = responses.some(shouldUndoStadiumChange);

            if (!shouldUndo) return;

            const didUndo = room.undoStadiumChange();

            if (didUndo) {
                ignoreNextStadiumUndo = true;
            }
        };

    const emitChat =
        () =>
        (...args: any[]) => {
            room.invalidateCaches();
            const player = args[0] as PlayerObject;
            const message = args[1] as string;
            const command = parseCommand(message);

            if (command) {
                const bufferedMessages: Array<
                    | { type: "send"; args: Parameters<Room["send"]>[0] }
                    | {
                          type: "chat";
                          args: [string, number | null | undefined];
                      }
                > = [];
                const originalSend = room.send;
                const originalChat = room.chat;

                room.send = (payload) => {
                    bufferedMessages.push({ type: "send", args: payload });
                };

                room.chat = (payload, to) => {
                    bufferedMessages.push({
                        type: "chat",
                        args: [payload, to],
                    });
                };

                const commandModules = modules.filter((module) =>
                    module.handlesCommand(command.name),
                );

                const responses = (() => {
                    try {
                        return commandModules.flatMap((module) =>
                            module.callCommand(room, player, command),
                        );
                    } finally {
                        room.send = originalSend;
                        room.chat = originalChat;
                    }
                })();

                const hideMessage = responses.some(
                    (response) => response.hideMessage === true,
                );

                if (!hideMessage) {
                    const allowDefaultEcho = modules.reduce((allow, module) => {
                        const moduleAllows = module.call(
                            "onPlayerChat",
                            room,
                            player,
                            message,
                        );

                        return allow && moduleAllows;
                    }, true);

                    if (allowDefaultEcho) {
                        room.send({
                            message: `${player.name}: ${message}`,
                        });
                    }
                }

                bufferedMessages.forEach((entry) => {
                    if (entry.type === "send") {
                        originalSend.call(room, entry.args);
                    } else {
                        originalChat.call(room, entry.args[0], entry.args[1]);
                    }
                });

                return false;
            }

            return modules.reduce((allow, module) => {
                const moduleAllows = module.call("onPlayerChat", room, ...args);
                return allow && moduleAllows;
            }, true);
        };

    const emitBeforeKick =
        () =>
        (...args: any[]) => {
            room.invalidateCaches();

            return modules.reduce((allow, module) => {
                const moduleAllows = module.call("onBeforeKick", room, ...args);
                return allow && moduleAllows;
            }, true);
        };

    roomObject.onPlayerJoin = emit("onPlayerJoin");
    roomObject.onPlayerLeave = emit("onPlayerLeave");
    roomObject.onTeamVictory = emit("onTeamVictory");
    roomObject.onPlayerChat = emitChat();
    roomObject.onPlayerBallKick = emit("onPlayerBallKick");
    roomObject.onTeamGoal = emit("onTeamGoal");
    roomObject.onGameStart = emit("onGameStart");
    roomObject.onGameStop = emit("onGameStop");
    roomObject.onPlayerAdminChange = emit("onPlayerAdminChange");
    roomObject.onPlayerTeamChange = emit("onPlayerTeamChange");
    roomObject.onBeforeKick = emitBeforeKick();
    roomObject.onPlayerKicked = emit("onPlayerKicked");
    roomObject.onGameTick = emit("onGameTick");
    roomObject.onGamePause = emit("onGamePause");
    roomObject.onGameUnpause = emit("onGameUnpause");
    roomObject.onPositionsReset = emit("onPositionsReset");
    roomObject.onPlayerActivity = emit("onPlayerActivity");
    roomObject.onStadiumChange = emitStadiumChange();
    roomObject.onRoomLink = emit("onRoomLink");
    roomObject.onKickRateLimitSet = emit("onKickRateLimitSet");
}
