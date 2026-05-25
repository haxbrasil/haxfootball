import type { Module } from "@core/module";
import type { OfficialAdminRegistry } from "../domain/admin-registry";
import type { RoomAuthorization } from "../domain/authorization";
import type { GameModeStore } from "../domain/game-mode";
import type { GameScoreStore } from "../domain/game-score";
import type { PlayerSessionReader } from "../domain/player-sessions";
import type { RuntimeStatEventSink } from "@runtime/runtime";
import { createChatLoggingModule } from "./chat-logging";
import { createCommunityModule } from "./community";
import { createGameModule } from "./game";
import { createHelpModule } from "./help";
import { createPasswordModule } from "./password";
import { createPlayerAccessModule } from "./player-access";

export function createSharedRoomModules({
    authorization,
    getPlayerSession,
    officialAdmins,
    autoManageNativeAdmins,
    gameScoreStore,
    gameModeStore,
    statEvents,
}: {
    authorization: RoomAuthorization;
    getPlayerSession: PlayerSessionReader;
    gameModeStore: GameModeStore;
    gameScoreStore?: GameScoreStore;
    officialAdmins?: OfficialAdminRegistry;
    autoManageNativeAdmins: boolean;
    statEvents?: RuntimeStatEventSink;
}): Module[] {
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
            gameModeStore,
            getPlayerSession,
            ...(statEvents ? { statEvents } : {}),
        }),
    ];
}
