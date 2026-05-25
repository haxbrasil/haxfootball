import { createModule, type Module } from "@core/module";
import { COMMAND_PREFIX } from "@core/commands";
import { createEngine, type Engine } from "@runtime/engine";
import type { RuntimeStatEventSink } from "@runtime/runtime";
import { t } from "@lingui/core/macro";
import { Room } from "@core/room";
import { COLOR } from "@common/general/color";
import type { RoomAuthorization } from "../domain/authorization";
import { type GameModeName, type GameModeStore } from "../domain/game-mode";
import type { PlayerSessionReader } from "../domain/player-sessions";
import type { GameScoreStore } from "../domain/game-score";
import {
    GAME_META_LIST,
    getGameMeta,
    type GameMetaRuntime,
} from "@meta/registry";
import { registerGameChatHandlers } from "./game-chat";
import {
    GAME_MODULE_COMMAND_DEFINITIONS,
    handleGameModuleCommand,
} from "./game-commands";

export function createGameModule({
    authorization,
    gameModeStore,
    gameScoreStore,
    getPlayerSession,
    statEvents,
}: {
    authorization: RoomAuthorization;
    gameModeStore: GameModeStore;
    gameScoreStore?: GameScoreStore;
    getPlayerSession: PlayerSessionReader;
    statEvents?: RuntimeStatEventSink;
}): Module {
    const metaRuntimes = Object.fromEntries(
        GAME_META_LIST.map((meta) => [meta.name, meta.createRuntime()]),
    ) as Record<GameModeName, GameMetaRuntime>;
    const metaCommandDefinitions = GAME_META_LIST.flatMap(
        (meta) => metaRuntimes[meta.name].commands,
    );
    const commandOwners = new Map<string, GameModeName>();

    GAME_META_LIST.forEach((meta) => {
        metaRuntimes[meta.name].commands.forEach((command) => {
            commandOwners.set(command.name, meta.name);
            command.aliases?.forEach((alias) => {
                commandOwners.set(alias, meta.name);
            });
        });
    });

    let engine: Engine<unknown> | null = null;
    let activeMode: GameModeName | null = null;

    const syncGameScore = () => {
        if (!activeMode) return;

        metaRuntimes[activeMode].syncGameScore(engine, gameScoreStore);
    };

    const getSelectedMeta = () => getGameMeta(gameModeStore.get());

    const getSelectedRuntime = () => metaRuntimes[getSelectedMeta().name];

    const getActiveRuntime = () =>
        activeMode ? metaRuntimes[activeMode] : getSelectedRuntime();

    const applySelectedMetaRoomSettings = (room: Room): void => {
        const meta = getSelectedMeta();

        room.setScoreLimit(meta.room.scoreLimit);
        room.setTimeLimit(meta.room.timeLimit);
        room.setStadium(meta.stadium);
    };

    const module = createModule()
        .setCommands({
            spec: { prefix: COMMAND_PREFIX },
            commands: [
                ...metaCommandDefinitions,
                ...GAME_MODULE_COMMAND_DEFINITIONS,
            ],
        })
        .onGameStart((room) => {
            const meta = getSelectedMeta();
            const metaRuntime = getSelectedRuntime();

            activeMode = meta.name;
            engine = createEngine(
                room,
                meta.registry,
                metaRuntime.createEngineOptions({
                    ...(statEvents ? { statEvents } : {}),
                }),
            );

            engine.start(meta.start.state, meta.start.params);
            syncGameScore();
        })
        .onGameTick(() => {
            engine?.tick();
            syncGameScore();
        })
        .onPlayerBallKick((_room, player) => {
            engine?.trackPlayerBallKick(player.id);
        })
        .onPlayerSendCommand((room, player, command) => {
            const gameCommandResponse = handleGameModuleCommand({
                applySelectedMetaRoomSettings,
                authorization,
                commandName: command.name,
                commandArgs: command.args,
                gameModeStore,
                getSelectedMeta,
                isGameRunning: engine?.isRunning() ?? false,
                player,
                room,
                selectedMeta: getSelectedMeta(),
            });

            if (gameCommandResponse) {
                return gameCommandResponse;
            }

            const commandPlayer = authorization.canUseGameCorrectionCommand(
                player,
            )
                ? { ...player, admin: true }
                : player;
            const { handled: handledByEngine } = engine
                ? engine.handlePlayerCommand(commandPlayer, command)
                : { handled: false };

            if (handledByEngine) {
                syncGameScore();
                return { hideMessage: true };
            }

            const selectedMeta = activeMode
                ? getGameMeta(activeMode)
                : getSelectedMeta();
            const commandOwner = commandOwners.get(command.name);

            if (commandOwner && commandOwner !== selectedMeta.name) {
                const ownerMeta = getGameMeta(commandOwner);

                room.send({
                    message: t`⚠️ That ${ownerMeta.label} command is unavailable in ${selectedMeta.label} mode.`,
                    color: COLOR.WARNING,
                    to: player.id,
                    sound: "notification",
                });

                return { hideMessage: true };
            }

            const metaResponse = getActiveRuntime().handleCommand({
                authorization,
                command,
                engine,
                player,
                room,
            });

            if (metaResponse) {
                return metaResponse;
            }

            room.send({
                message: engine
                    ? t`⚠️ You cannot use that command right now.`
                    : t`⚠️ The game has not been started yet.`,
                color: COLOR.WARNING,
                to: player.id,
            });

            return { hideMessage: true };
        });

    registerGameChatHandlers(module, {
        getEngine: () => engine,
        getPlayerSession,
        syncGameScore,
    });

    return module
        .onPlayerTeamChange((_room, changedPlayer, byPlayer) => {
            engine?.handlePlayerTeamChange(changedPlayer, byPlayer);
            syncGameScore();
        })
        .onPlayerLeave((_room, player) => {
            engine?.handlePlayerLeave(player);
            syncGameScore();
        })
        .onGameStop((room) => {
            getActiveRuntime().handleGameStop({
                engine,
                ...(gameScoreStore ? { gameScoreStore } : {}),
                room,
            });

            engine?.stop();
            engine = null;
            activeMode = null;
            gameScoreStore?.reset();
        })
        .onGamePause((_room, byPlayer) => {
            engine?.handleGamePause(byPlayer);
        })
        .onGameUnpause((_room, byPlayer) => {
            engine?.handleGameUnpause(byPlayer);
        })
        .onRoomLink((room) => {
            applySelectedMetaRoomSettings(room);
        })
        .onStadiumChange((_room, _newStadiumName, byPlayer) => {
            if (byPlayer) {
                return { undo: true };
            }

            return { undo: false };
        });
}
