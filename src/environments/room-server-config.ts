import type { RoomServerEnvironment } from "@env/room-server";

export function createRoomConfig(
    environment: RoomServerEnvironment,
    baseConfig: RoomConfigObject,
): RoomConfigObject {
    return {
        ...baseConfig,
        roomName: environment.roomName,
        maxPlayers: environment.maxPlayers,
        public: environment.roomPublic,
        noPlayer: environment.noPlayer,
        token: environment.roomToken,
        ...(environment.roomPassword
            ? { password: environment.roomPassword }
            : {}),
        ...(environment.geo ? { geo: environment.geo } : {}),
        ...(environment.proxy ? { proxy: environment.proxy } : {}),
    };
}
