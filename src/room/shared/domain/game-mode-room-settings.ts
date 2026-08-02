import type { Room } from "@core/room";
import { NATIVE_CLOCK_BALL_DISC_ID } from "@core/ball";
import type { GameModeDefinition } from "@modes/types";

export function applyGameModeRoomSettings(
    room: Room,
    mode: GameModeDefinition,
): void {
    room.setBallDiscRef(mode.ballDiscRef ?? NATIVE_CLOCK_BALL_DISC_ID);
    room.setScoreLimit(mode.room.scoreLimit);
    room.setTimeLimit(mode.room.timeLimit);
    room.setStadium(mode.stadium);
}
