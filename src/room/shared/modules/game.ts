import { createModule, type Module } from "@core/module";
import { COMMAND_PREFIX } from "@core/commands";
import { createEngine, type Engine } from "@runtime/engine";
import type { RuntimeMatchEventSink } from "@runtime/runtime";
import { t } from "@lingui/core/macro";
import { Room } from "@core/room";
import { COLOR } from "@common/general/color";
import type { RoomAuthorization } from "../domain/authorization";
import { type GameModeName, type GameModeStore } from "../domain/game-mode";
import type { PlayerSessionReader } from "../domain/player-sessions";
import type { GameScore, GameScoreStore } from "../domain/game-score";
import { applyGameModeRoomSettings } from "../domain/game-mode-room-settings";
import {
    GAME_MODE_LIST,
    getGameModeDefinition,
    type GameModeRuntime,
} from "@modes/registry";
import { registerGameChatHandlers } from "./game-chat";
import {
    GAME_MODULE_COMMAND_DEFINITIONS,
    handleGameModuleCommand,
} from "./game-commands";
import {
    createIdleGameRuntimeSnapshot,
    type GameRuntimeStore,
} from "../domain/game-runtime";

export function createGameModule({
    authorization,
    gameModeStore,
    gameScoreStore,
    gameRuntimeStore,
    getPlayerSession,
    matchEvents,
}: {
    authorization: RoomAuthorization;
    gameModeStore: GameModeStore;
    gameScoreStore?: GameScoreStore;
    gameRuntimeStore?: GameRuntimeStore;
    getPlayerSession: PlayerSessionReader;
    matchEvents?: RuntimeMatchEventSink;
}): Module {
    const modeRuntimes = Object.fromEntries(
        GAME_MODE_LIST.map((mode) => [mode.name, mode.createRuntime()]),
    ) as Record<GameModeName, GameModeRuntime>;
    const modeCommandDefinitions = GAME_MODE_LIST.flatMap(
        (mode) => modeRuntimes[mode.name].commands,
    );
    const commandOwners = new Map<string, Set<GameModeName>>();

    const addCommandOwner = (commandName: string, modeName: GameModeName) => {
        const owners = commandOwners.get(commandName) ?? new Set();
        owners.add(modeName);
        commandOwners.set(commandName, owners);
    };

    GAME_MODE_LIST.forEach((mode) => {
        modeRuntimes[mode.name].commands.forEach((command) => {
            addCommandOwner(command.name, mode.name);
            command.aliases?.forEach((alias) => {
                addCommandOwner(alias, mode.name);
            });
        });
    });

    let engine: Engine<unknown> | null = null;
    let activeMode: GameModeName | null = null;
    const visualScore = { lastSent: null as GameScore | null };

    const syncGameScore = () => {
        if (!activeMode) return;

        modeRuntimes[activeMode].syncGameScore(engine, gameScoreStore);
    };

    const syncVisualScore = (room: Room) => {
        const score = gameScoreStore?.get() ?? null;

        if (!score) {
            visualScore.lastSent = null;
            return;
        }

        if (
            visualScore.lastSent?.red === score.red &&
            visualScore.lastSent.blue === score.blue
        ) {
            return;
        }

        room.setScore(score.red, score.blue);

        visualScore.lastSent = {
            red: score.red,
            blue: score.blue,
        };
    };

    const syncScores = (room: Room) => {
        syncGameScore();
        syncVisualScore(room);
    };

    const getSelectedModeDefinition = () =>
        getGameModeDefinition(gameModeStore.get());

    const getSelectedRuntime = () =>
        modeRuntimes[getSelectedModeDefinition().name];

    const getActiveRuntime = () =>
        activeMode ? modeRuntimes[activeMode] : getSelectedRuntime();

    const applySelectedModeRoomSettings = (room: Room): void => {
        applyGameModeRoomSettings(room, getSelectedModeDefinition());
    };

    const writeGameRuntimeSnapshot = () => {
        const selectedMode = getSelectedModeDefinition().name;

        if (!engine) {
            gameRuntimeStore?.set(
                createIdleGameRuntimeSnapshot(selectedMode, null),
            );
            return;
        }

        gameRuntimeStore?.set({
            selectedMode,
            activeMode,
            running: engine.isRunning(),
            paused: engine.isPaused(),
            inspection: engine.getInspection(),
            diagnosticStateKey: engine.getCurrentStateName(),
            checkpoints: engine.getCheckpoints(),
            score: gameScoreStore?.get() ?? null,
            result: activeMode
                ? modeRuntimes[activeMode].getCompletedResult()
                : null,
        });
    };

    const stopLocalGame = (room: Room) => {
        if (!engine) {
            return;
        }

        const completedResult = activeMode
            ? modeRuntimes[activeMode].getCompletedResult()
            : null;

        getActiveRuntime().handleGameStop({
            engine,
            ...(gameScoreStore ? { gameScoreStore } : {}),
            room,
        });

        engine.stop();
        engine = null;
        activeMode = null;
        gameScoreStore?.reset();
        visualScore.lastSent = null;
        gameRuntimeStore?.reset(
            createIdleGameRuntimeSnapshot(
                getSelectedModeDefinition().name,
                completedResult,
            ),
        );
    };

    const module = createModule()
        .setCommands({
            spec: { prefix: COMMAND_PREFIX },
            commands: [
                ...modeCommandDefinitions,
                ...GAME_MODULE_COMMAND_DEFINITIONS,
            ],
        })
        .onGameStart((room) => {
            const mode = getSelectedModeDefinition();
            const modeRuntime = getSelectedRuntime();
            const engineOptionsArgs = matchEvents ? { matchEvents } : {};

            if (engine?.isRunning() && activeMode === mode.name) {
                writeGameRuntimeSnapshot();
                return;
            }

            visualScore.lastSent = null;
            activeMode = mode.name;
            engine = createEngine(
                room,
                mode.registry,
                modeRuntime.createEngineOptions(engineOptionsArgs),
            );

            engine.start(mode.start.state, mode.start.params);

            gameRuntimeStore?.setOperations({
                restoreCheckpoint: (args) => {
                    engine?.restoreCheckpoint(args);
                },
                setPrePlayTimeoutHold: (held) => {
                    engine?.setPrePlayTimeoutHold(held);
                },
                stopGame: () => {
                    room.stopGame();
                },
            });
            syncScores(room);
            writeGameRuntimeSnapshot();
        })
        .onGameTick((room) => {
            engine?.tick();
            syncScores(room);

            if (activeMode) {
                modeRuntimes[activeMode].handleGameTickEnd?.({
                    engine,
                    ...(gameScoreStore ? { gameScoreStore } : {}),
                    room,
                });
            }

            writeGameRuntimeSnapshot();
        })
        .onPlayerBallKick((_room, player) => {
            engine?.trackPlayerBallKick(player.id);
        })
        .onPlayerSendCommand((room, player, command) => {
            const gameCommandResponse = handleGameModuleCommand({
                applySelectedModeRoomSettings,
                authorization,
                commandName: command.name,
                commandArgs: command.args,
                gameModeStore,
                getSelectedModeDefinition,
                isGameRunning: engine?.isRunning() ?? false,
                player,
                room,
                selectedModeDefinition: getSelectedModeDefinition(),
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
                syncScores(room);
                writeGameRuntimeSnapshot();
                return { hideMessage: true };
            }

            const selectedModeDefinition = activeMode
                ? getGameModeDefinition(activeMode)
                : getSelectedModeDefinition();
            const commandModeOwners = commandOwners.get(command.name);

            if (
                commandModeOwners &&
                !commandModeOwners.has(selectedModeDefinition.name)
            ) {
                const ownerMode = Array.from(commandModeOwners)[0];
                if (!ownerMode) {
                    return { hideMessage: true };
                }
                const ownerModeDefinition = getGameModeDefinition(ownerMode);

                room.send({
                    message: t`⚠️ That ${ownerModeDefinition.label} command is unavailable in ${selectedModeDefinition.label} mode.`,
                    color: COLOR.WARNING,
                    to: player.id,
                    sound: "notification",
                });

                return { hideMessage: true };
            }

            const modeResponse = getActiveRuntime().handleCommand({
                authorization,
                command,
                engine,
                player,
                room,
            });

            if (modeResponse) {
                return modeResponse;
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
        syncGameScore: syncScores,
    });

    return module
        .onPlayerTeamChange((room, changedPlayer, byPlayer) => {
            engine?.handlePlayerTeamChange(changedPlayer, byPlayer);
            syncScores(room);
            writeGameRuntimeSnapshot();
        })
        .onPlayerLeave((room, player) => {
            engine?.handlePlayerLeave(player);
            syncScores(room);
            writeGameRuntimeSnapshot();
        })
        .onBeforeGameStop((room) => {
            stopLocalGame(room);
        })
        .onGameStop((room) => {
            stopLocalGame(room);
        })
        .onGamePause((_room, byPlayer) => {
            engine?.handleGamePause(byPlayer);
            writeGameRuntimeSnapshot();
        })
        .onGameUnpause((_room, byPlayer) => {
            engine?.handleGameUnpause(byPlayer);
            writeGameRuntimeSnapshot();
        })
        .onRoomLink((room) => {
            applySelectedModeRoomSettings(room);
        })
        .onStadiumChange((_room, _newStadiumName, byPlayer) => {
            if (byPlayer) {
                return { undo: true };
            }

            return { undo: false };
        });
}
