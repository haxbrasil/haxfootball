import {
    createHaxFootballRoomApiClient,
    type HaxFootballApiClient,
} from "@haxbrasil/haxfootball-api-sdk";

let apiClient: HaxFootballApiClient | undefined;

export const api = new Proxy({} as HaxFootballApiClient, {
    get(_target, property, receiver) {
        const client = getApiClient();
        const value = Reflect.get(client, property, receiver);

        return typeof value === "function" ? value.bind(client) : value;
    },
});

function getApiClient(): HaxFootballApiClient {
    apiClient ??= createHaxFootballRoomApiClient();

    return apiClient;
}
