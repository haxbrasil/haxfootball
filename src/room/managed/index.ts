import { getConfig } from "@room/shared/domain/config";
import { createSharedRoomModules } from "@room/shared/modules";
import { createRoomSetupModule } from "@room/shared/modules/room-setup";
import { createPlayerSessionStore } from "@room/shared/domain/player-sessions";
import { createGameScoreStore } from "@room/shared/domain/game-score";
import { createGameModeStore } from "@room/shared/domain/game-mode";
import { createManagedAuthorization } from "./domain/authorization";
import { createManagedAdminModule } from "./modules/admin";
import { createAuthenticationModule } from "./modules/authentication";
import { createManagedMatchPersistence } from "./modules/match-persistence";

type ManagedRoomModulesOptions = {
    publicWebBaseUrl?: string | undefined;
    roomId?: string | undefined;
};

export { getConfig };

export function createModules(options: ManagedRoomModulesOptions = {}) {
    const sessionStore = createPlayerSessionStore();
    const gameScoreStore = createGameScoreStore();
    const gameModeStore = createGameModeStore();
    const authorization = createManagedAuthorization({ sessionStore });
    const matchPersistence = createManagedMatchPersistence({
        gameModeReader: gameModeStore.get,
        gameScoreReader: gameScoreStore.get,
        publicWebBaseUrl: options.publicWebBaseUrl,
        sessionStore,
    });
    const sharedModules = createSharedRoomModules({
        authorization,
        autoManageNativeAdmins: false,
        gameModeStore,
        gameScoreStore,
        getPlayerSession: sessionStore.get,
        statEvents: matchPersistence.statEvents,
    });
    const downstreamModules = [matchPersistence.module, ...sharedModules];

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
