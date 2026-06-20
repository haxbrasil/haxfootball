import type { Module } from "@core/module";
import { env } from "@env/room";
import type { OfficialAdminRegistry } from "../domain/admin-registry";
import type { RoomAuthorization } from "../domain/authorization";
import type { GameModeStore } from "../domain/game-mode";
import type { GameScoreStore } from "../domain/game-score";
import type { PlayerSessionReader } from "../domain/player-sessions";
import type { RuntimeMatchEventSink } from "@runtime/runtime";
import type { RoomManagerEventSink } from "../domain/room-manager";
import {
    createGameRuntimeStore,
    createIdleGameRuntimeSnapshot,
} from "../domain/game-runtime";
import { createChatLoggingModule } from "./chat-logging";
import { createCommunityModule } from "./community";
import { createGameModule } from "./game";
import { createHelpModule } from "./help";
import { createPasswordModule } from "./password";
import { createPlayerAccessModule } from "./player-access";
import { createRoomManagerModule } from "./room-manager";

type SharedRoomManagerOptions = {
    launchEnabled: boolean;
    managedRoom: boolean;
    afkActivityDetectionEnabled?: boolean;
    eventSink?: RoomManagerEventSink;
    visibleActionDelayMs?: number;
};

export function createSharedRoomModules({
    authorization,
    getPlayerSession,
    officialAdmins,
    autoManageNativeAdmins,
    gameScoreStore,
    gameModeStore,
    matchEvents,
    roomManager,
}: {
    authorization: RoomAuthorization;
    getPlayerSession: PlayerSessionReader;
    gameModeStore: GameModeStore;
    gameScoreStore?: GameScoreStore;
    officialAdmins?: OfficialAdminRegistry;
    autoManageNativeAdmins: boolean;
    matchEvents?: RuntimeMatchEventSink;
    roomManager: SharedRoomManagerOptions;
}): Module[] {
    const gameRuntimeStore = createGameRuntimeStore(
        createIdleGameRuntimeSnapshot(gameModeStore.get()),
    );
    const roomManagerEnabled =
        env.ROOM_MANAGER_ENABLED ?? roomManager.launchEnabled;
    const afkActivityDetectionEnabled =
        env.ROOM_MANAGER_AFK_ACTIVITY_DETECTION_ENABLED ??
        roomManager.afkActivityDetectionEnabled ??
        !env.DEBUG;

    return [
        createPasswordModule({ authorization }),
        createPlayerAccessModule({
            authorization,
            autoManageNativeAdmins,
            ...(officialAdmins ? { officialAdmins } : {}),
        }),
        createCommunityModule(),
        createHelpModule({ authorization }),
        createChatLoggingModule(),
        createGameModule({
            authorization,
            ...(gameScoreStore ? { gameScoreStore } : {}),
            gameRuntimeStore,
            gameModeStore,
            getPlayerSession,
            ...(matchEvents ? { matchEvents } : {}),
        }),
        createRoomManagerModule({
            authorization,
            afkActivityDetectionEnabled,
            enabled: roomManagerEnabled,
            gameModeStore,
            gameRuntimeStore,
            getPlayerSession,
            managedRoom: roomManager.managedRoom,
            ...(roomManager.eventSink
                ? { eventSink: roomManager.eventSink }
                : {}),
            ...(roomManager.visibleActionDelayMs !== undefined
                ? { visibleActionDelayMs: roomManager.visibleActionDelayMs }
                : {}),
        }),
    ];
}
