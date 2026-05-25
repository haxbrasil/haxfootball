import { COLOR } from "@common/general/color";
import type { CommandDefinition, CommandResponse } from "@core/commands";
import type { Room } from "@core/room";
import type { GameMetaDefinition } from "@meta/types";
import { t } from "@lingui/core/macro";
import type { RoomAuthorization } from "../domain/authorization";
import { CommandCategory } from "../domain/command-categories";
import {
    GAME_MODE_NAMES,
    parseGameModeName,
    type GameModeStore,
} from "../domain/game-mode";

export const GAME_MODULE_COMMAND = {
    MODE: "mode",
    VERSION: "version",
} as const;

export const GAME_MODULE_COMMAND_DEFINITIONS: CommandDefinition[] = [
    {
        name: GAME_MODULE_COMMAND.VERSION,
        category: CommandCategory.Game,
        description: t`Show the game version`,
    },
    {
        name: GAME_MODULE_COMMAND.MODE,
        category: CommandCategory.Room,
        description: t`Show or change the game mode`,
    },
];

export function handleGameModuleCommand({
    applySelectedMetaRoomSettings,
    authorization,
    commandName,
    commandArgs,
    gameModeStore,
    getSelectedMeta,
    isGameRunning,
    player,
    room,
    selectedMeta,
}: {
    applySelectedMetaRoomSettings(room: Room): void;
    authorization: RoomAuthorization;
    commandName: string;
    commandArgs: readonly string[];
    gameModeStore: GameModeStore;
    getSelectedMeta(): GameMetaDefinition;
    isGameRunning: boolean;
    player: PlayerObject;
    room: Room;
    selectedMeta: GameMetaDefinition;
}): CommandResponse | null {
    if (commandName === GAME_MODULE_COMMAND.MODE) {
        const requestedMode = commandArgs[0];

        if (requestedMode === undefined) {
            room.send({
                message: t`🎛️ Current game mode: ${selectedMeta.label}.`,
                color: COLOR.SYSTEM,
                to: player.id,
                sound: "notification",
            });

            return { hideMessage: true };
        }

        if (!authorization.canChangeGameMode(player)) {
            room.send({
                message: t`🚫 Only admins can change the game mode.`,
                color: COLOR.ERROR,
                to: player.id,
                sound: "notification",
            });

            return { hideMessage: true };
        }

        if (isGameRunning) {
            room.send({
                message: t`⚠️ Game mode cannot be changed while a game is in progress.`,
                color: COLOR.WARNING,
                to: player.id,
                sound: "notification",
            });

            return { hideMessage: true };
        }

        const parsedMode = parseGameModeName(requestedMode);

        if (!parsedMode) {
            room.send({
                message: t`⚠️ Unknown game mode. Use ${GAME_MODE_NAMES.join(" or ")}.`,
                color: COLOR.WARNING,
                to: player.id,
                sound: "notification",
            });

            return { hideMessage: true };
        }

        gameModeStore.set(parsedMode);
        applySelectedMetaRoomSettings(room);
        const updatedMeta = getSelectedMeta();

        room.send({
            message: t`🎛️ ${player.name} changed the game mode to ${updatedMeta.label}.`,
            color: COLOR.ADMIN,
            sound: "notification",
        });

        return { hideMessage: true };
    }

    if (commandName === GAME_MODULE_COMMAND.VERSION) {
        room.send({
            message: t`🏈 HaxFootball 2026`,
            color: COLOR.SYSTEM,
            to: player.id,
        });

        return { hideMessage: true };
    }

    return null;
}
