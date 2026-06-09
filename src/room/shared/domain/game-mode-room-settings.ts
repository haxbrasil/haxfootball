import type { Room } from "@core/room";
import type { GameModeDefinition } from "@modes/types";

export function applyGameModeRoomSettings(
    room: Room,
    mode: GameModeDefinition,
): void {
    room.setScoreLimit(mode.room.scoreLimit);
    room.setTimeLimit(mode.room.timeLimit);
    room.setStadium(mode.stadium);
}
