import { createOfficialAdminRegistry } from "@room/shared/domain/admin-registry";
import { createNativeAdminAuthorization } from "@room/shared/domain/authorization";
import { getConfig } from "@room/shared/domain/config";
import { createGeneratedAdminModule } from "@room/shared/modules/admin";
import { createLocalPlayerSessionsModule } from "@room/shared/modules/local-player-sessions";
import { createSharedRoomModules } from "@room/shared/modules";
import { createRoomSetupModule } from "@room/shared/modules/room-setup";
import { createPlayerSessionStore } from "@room/shared/domain/player-sessions";
import { createGameModeStore } from "@room/shared/domain/game-mode";

type ManualRoomModulesOptions = {
    roomId?: string | undefined;
    roomManagerAfkActivityDetectionEnabled?: boolean | undefined;
    roomManagerEnabled?: boolean | undefined;
};

export { getConfig };

export function createModules(options: ManualRoomModulesOptions = {}) {
    const sessionStore = createPlayerSessionStore();
    const gameModeStore = createGameModeStore();
    const officialAdmins = createOfficialAdminRegistry();
    const nativeAdminAuthorization = createNativeAdminAuthorization();
    const authorization = {
        ...nativeAdminAuthorization,
        canChangeGameMode: (player: PlayerObject) => officialAdmins.has(player),
        canKickOrBan: (player: PlayerObject) => officialAdmins.has(player),
    };

    return [
        createRoomSetupModule(),
        createGeneratedAdminModule({ officialAdmins }),
        createLocalPlayerSessionsModule({ sessionStore }),
        ...createSharedRoomModules({
            authorization,
            autoManageNativeAdmins: true,
            gameModeStore,
            getPlayerSession: sessionStore.get,
            officialAdmins,
            roomManager: {
                ...(options.roomManagerAfkActivityDetectionEnabled !== undefined
                    ? {
                          afkActivityDetectionEnabled:
                              options.roomManagerAfkActivityDetectionEnabled,
                      }
                    : {}),
                launchEnabled: options.roomManagerEnabled ?? false,
                managedRoom: false,
            },
        }),
    ];
}

export const modules = createModules();
