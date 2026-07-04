import { getConfig } from "@room/shared/domain/config";
import { env } from "@env/room";
import { parseJson } from "@common/general/json";
import { createSharedRoomModules } from "@room/shared/modules";
import { createRoomSetupModule } from "@room/shared/modules/room-setup";
import { createPlayerSessionStore } from "@room/shared/domain/player-sessions";
import { createGameScoreStore } from "@room/shared/domain/game-score";
import { createGameModeStore } from "@room/shared/domain/game-mode";
import { createManagedAuthorization } from "./domain/authorization";
import { createManagedAdminModule } from "./modules/admin";
import { createAuthenticationModule } from "./modules/authentication";
import { createManagedLifecycleModule } from "./modules/lifecycle";
import {
    createManagedLiveStateModule,
    type LiveStateContract,
} from "./modules/live-state";
import { createManagedMatchPersistence } from "./modules/match-persistence";
import {
    createManagedIncidentModule,
    type RoomIncidentReporter,
} from "./modules/incidents";
import {
    createManagedRoomEvents,
    createManagedRoomManagerEventSink,
} from "./modules/room-events";

type ManagedRoomModulesOptions = {
    commId?: string | undefined;
    incidentReporter?: RoomIncidentReporter | undefined;
    liveStateContractJson?: string | undefined;
    publicWebBaseUrl?: string | undefined;
    roomId?: string | undefined;
    roomName?: string | undefined;
    roomManagerAfkActivityDetectionEnabled?: boolean | undefined;
    roomManagerEnabled?: boolean | undefined;
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
    const roomManagerLaunchEnabled = options.roomManagerEnabled ?? true;
    const roomManagerEnabled =
        env.ROOM_MANAGER_ENABLED ?? roomManagerLaunchEnabled;
    const sharedModules = createSharedRoomModules({
        authorization,
        autoManageNativeAdmins: false,
        gameModeStore,
        gameScoreStore,
        getPlayerSession: sessionStore.get,
        matchEvents: matchPersistence.matchEvents,
        roomManager: {
            ...(options.roomManagerAfkActivityDetectionEnabled !== undefined
                ? {
                      afkActivityDetectionEnabled:
                          options.roomManagerAfkActivityDetectionEnabled,
                  }
                : {}),
            eventSink: createManagedRoomManagerEventSink({
                roomId: options.roomId,
            }),
            launchEnabled: roomManagerLaunchEnabled,
            managedRoom: true,
        },
    });
    const lifecycle = roomManagerEnabled
        ? null
        : createManagedLifecycleModule({ gameModeStore });
    const roomEvents = createManagedRoomEvents({
        roomId: options.roomId,
        sessionStore,
    });
    const incidents = options.incidentReporter
        ? createManagedIncidentModule({
              reporter: options.incidentReporter,
          })
        : null;
    const liveStateOptions =
        options.commId && options.roomId
            ? {
                  commId: options.commId,
                  roomId: options.roomId,
              }
            : null;
    const liveState = liveStateOptions
        ? createManagedLiveStateModule({
              commId: liveStateOptions.commId,
              getPlayerSession: sessionStore.get,
              liveStateContract: parseJson<LiveStateContract>(
                  options.liveStateContractJson,
                  { label: "live state contract JSON" },
              ),
              roomId: liveStateOptions.roomId,
              roomName:
                  options.roomName ?? getConfig().roomName ?? "HaxFootball",
          })
        : null;
    const downstreamModules = [
        roomEvents,
        matchPersistence.module,
        ...sharedModules,
        ...(incidents ? [incidents] : []),
        ...(liveState ? [liveState] : []),
        ...(lifecycle ? [lifecycle] : []),
    ];

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
