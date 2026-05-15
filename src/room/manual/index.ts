import { t } from "@lingui/core/macro";
import { modules as roomModules } from "./modules/room";
import { modules as gameModules } from "./modules/game";
import { env } from "@env/room";
import { createAuthenticationModule } from "./modules/authentication";

type ManualRoomModulesOptions = {
    roomId?: string | undefined;
};

const config: RoomConfigObject = {
    roomName: t`🏈 HaxFootball - American Football 🏈`,
    maxPlayers: 25,
    noPlayer: true,
    public: !env.DEBUG,
    ...(env.PROXY ? { proxy: env.PROXY } : {}),
};

export const getConfig = () => config;

export function createModules(options: ManualRoomModulesOptions = {}) {
    const downstreamModules = [...roomModules, ...gameModules];

    return [
        createAuthenticationModule({
            roomId: options.roomId,
            downstreamModules,
        }),
        ...downstreamModules,
    ];
}

export const modules = createModules();
