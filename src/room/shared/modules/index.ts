import type { Module } from "@core/module";
import type { OfficialAdminRegistry } from "../domain/admin-registry";
import type { RoomAuthorization } from "../domain/authorization";
import type { PlayerSessionReader } from "../domain/player-sessions";
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
}: {
    authorization: RoomAuthorization;
    getPlayerSession: PlayerSessionReader;
    officialAdmins?: OfficialAdminRegistry;
    autoManageNativeAdmins: boolean;
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
        createGameModule({ authorization, getPlayerSession }),
    ];
}
