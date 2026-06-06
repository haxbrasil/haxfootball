import type { AddRoomEventInput } from "@haxbrasil/haxfootball-api-sdk";
import {
    toApiPlayerEventFields,
    toApiTeam,
} from "@room/managed/domain/api-event-fields";
import type { PlayerSessionReader } from "@room/shared/domain/player-sessions";

export const ROOM_INSTANCE_EVENT = {
    PlayerJoined: "player-joined",
    PlayerTeamChange: "player-team-change",
    PlayerLeave: "player-leave",
} as const;

export type RoomInstanceEventName =
    (typeof ROOM_INSTANCE_EVENT)[keyof typeof ROOM_INSTANCE_EVENT];

export type RoomEventInput = AddRoomEventInput;

type PlayerRoomEventPatch = Partial<Pick<RoomEventInput, "team">> & {
    type: RoomInstanceEventName;
    value: unknown;
};

const playerRoomEventDispatch = {
    onPlayerJoin: (player: PlayerObject): PlayerRoomEventPatch => ({
        type: ROOM_INSTANCE_EVENT.PlayerJoined,
        team: toApiTeam(player.team),
        value: {
            name: player.name,
        },
    }),
    onPlayerLeave: (player: PlayerObject): PlayerRoomEventPatch => ({
        type: ROOM_INSTANCE_EVENT.PlayerLeave,
        value: {
            name: player.name,
        },
    }),
    onPlayerTeamChange: (player: PlayerObject): PlayerRoomEventPatch => ({
        type: ROOM_INSTANCE_EVENT.PlayerTeamChange,
        team: toApiTeam(player.team),
        value: {
            name: player.name,
        },
    }),
} as const;

export type RoomPlayerEventHook = keyof typeof playerRoomEventDispatch;

export function toPlayerRoomEvent({
    hook,
    player,
    getPlayerSession,
}: {
    hook: RoomPlayerEventHook;
    player: PlayerObject;
    getPlayerSession: PlayerSessionReader;
}): RoomEventInput {
    const patch = playerRoomEventDispatch[hook](player);
    const event: RoomEventInput = {
        domain: "room",
        type: patch.type,
        scope: "player",
        ...toApiPlayerEventFields({
            player,
            getPlayerSession,
        }),
        value: patch.value,
    };

    if (patch.team) {
        event.team = patch.team;
    }

    return event;
}
