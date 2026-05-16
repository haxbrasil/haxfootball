import { createOfficialAdminRegistry } from "@room/shared/domain/admin-registry";
import { createNativeAdminAuthorization } from "@room/shared/domain/authorization";
import { getConfig } from "@room/shared/domain/config";
import { createGeneratedAdminModule } from "@room/shared/modules/admin";
import { createLocalPlayerSessionsModule } from "@room/shared/modules/local-player-sessions";
import { createSharedRoomModules } from "@room/shared/modules";
import { createRoomSetupModule } from "@room/shared/modules/room-setup";
import { createPlayerSessionStore } from "@room/shared/domain/player-sessions";

type ManualRoomModulesOptions = {
    roomId?: string | undefined;
};

export { getConfig };

export function createModules(_options: ManualRoomModulesOptions = {}) {
    const sessionStore = createPlayerSessionStore();
    const officialAdmins = createOfficialAdminRegistry();
    const nativeAdminAuthorization = createNativeAdminAuthorization();
    const authorization = {
        ...nativeAdminAuthorization,
        canKickOrBan: (player: PlayerObject) => officialAdmins.has(player),
    };

    return [
        createRoomSetupModule(),
        createGeneratedAdminModule({ officialAdmins }),
        createLocalPlayerSessionsModule({ sessionStore }),
        ...createSharedRoomModules({
            authorization,
            autoManageNativeAdmins: true,
            getPlayerSession: sessionStore.get,
            officialAdmins,
        }),
    ];
}

export const modules = createModules();
