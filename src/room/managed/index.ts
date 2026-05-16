import { getConfig } from "@room/shared/domain/config";
import { createSharedRoomModules } from "@room/shared/modules";
import { createRoomSetupModule } from "@room/shared/modules/room-setup";
import { createPlayerSessionStore } from "@room/shared/domain/player-sessions";
import { createManagedAuthorization } from "./domain/authorization";
import { createManagedAdminModule } from "./modules/admin";
import { createAuthenticationModule } from "./modules/authentication";

type ManagedRoomModulesOptions = {
    roomId?: string | undefined;
};

export { getConfig };

export function createModules(options: ManagedRoomModulesOptions = {}) {
    const sessionStore = createPlayerSessionStore();
    const authorization = createManagedAuthorization({ sessionStore });
    const downstreamModules = createSharedRoomModules({
        authorization,
        autoManageNativeAdmins: false,
        getPlayerSession: sessionStore.get,
    });

    return [
        createRoomSetupModule(),
        createAuthenticationModule({
            roomId: options.roomId,
            downstreamModules,
            sessionStore,
        }),
        createManagedAdminModule({ authorization }),
        ...downstreamModules,
    ];
}

export const modules = createModules();
