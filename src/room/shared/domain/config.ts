import { env } from "@env/room";
import { t } from "@lingui/core/macro";

const config: RoomConfigObject = {
    roomName: t`🏈 HaxFootball - American Football 🏈`,
    maxPlayers: 25,
    noPlayer: true,
    public: !env.DEBUG,
    ...(env.PROXY ? { proxy: env.PROXY } : {}),
};

export const getConfig = () => config;
