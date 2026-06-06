import type { MatchEventInput } from "@haxbrasil/haxfootball-api-sdk";
import {
    getSessionPlayerId,
    isFieldTeam,
    nowIso,
    toApiTeam,
} from "@room/managed/domain/api-event-fields";
import type { PlayerSessionReader } from "@room/shared/domain/player-sessions";

export const MATCH_ROOM_EVENT = {
    PlayerTeamChange: "player-team-change",
    PlayerLeave: "player-leave",
} as const;

export type MatchRoomEventName =
    (typeof MATCH_ROOM_EVENT)[keyof typeof MATCH_ROOM_EVENT];

export type MatchPlayerEventHook =
    | "onPlayerJoin"
    | "onPlayerLeave"
    | "onPlayerTeamChange";

export type MatchPlayerEventState = {
    fieldParticipantRoomIds: Set<number>;
    playerIds: Map<number, string>;
};

type MatchPlayerEventContext = {
    hook: MatchPlayerEventHook;
    state: MatchPlayerEventState;
    player: PlayerObject;
    getPlayerSession: PlayerSessionReader;
    elapsedSeconds: number;
};

type MatchPlayerEventPatch = {
    type: MatchRoomEventName;
    team?: MatchEventInput["team"];
    value: unknown;
};

type MatchPlayerEventProjectorContext = Omit<MatchPlayerEventContext, "hook">;

type MatchPlayerEventProjector = (
    context: MatchPlayerEventProjectorContext,
) => MatchEventInput | null;

const matchPlayerEventDispatch = {
    onPlayerJoin: ({
        state,
        player,
        getPlayerSession,
        elapsedSeconds,
    }: MatchPlayerEventProjectorContext): MatchEventInput | null => {
        if (!isFieldTeam(player.team)) return null;

        state.fieldParticipantRoomIds.add(player.id);

        return toMatchPlayerEvent(
            { state, player, getPlayerSession, elapsedSeconds },
            {
                type: MATCH_ROOM_EVENT.PlayerTeamChange,
                team: toApiTeam(player.team),
                value: {},
            },
        );
    },
    onPlayerTeamChange: ({
        state,
        player,
        getPlayerSession,
        elapsedSeconds,
    }: MatchPlayerEventProjectorContext): MatchEventInput | null => {
        const wasFieldParticipant = state.fieldParticipantRoomIds.has(
            player.id,
        );

        if (!isFieldTeam(player.team) && !wasFieldParticipant) return null;

        if (isFieldTeam(player.team)) {
            state.fieldParticipantRoomIds.add(player.id);
        }

        return toMatchPlayerEvent(
            { state, player, getPlayerSession, elapsedSeconds },
            {
                type: MATCH_ROOM_EVENT.PlayerTeamChange,
                team: toApiTeam(player.team),
                value: {},
            },
        );
    },
    onPlayerLeave: ({
        state,
        player,
        getPlayerSession,
        elapsedSeconds,
    }: MatchPlayerEventProjectorContext): MatchEventInput | null => {
        if (!state.fieldParticipantRoomIds.has(player.id)) return null;

        return toMatchPlayerEvent(
            { state, player, getPlayerSession, elapsedSeconds },
            {
                type: MATCH_ROOM_EVENT.PlayerLeave,
                value: {},
            },
        );
    },
} as const satisfies Record<MatchPlayerEventHook, MatchPlayerEventProjector>;

export function projectMatchPlayerEvent({
    hook,
    state,
    player,
    getPlayerSession,
    elapsedSeconds,
}: MatchPlayerEventContext): MatchEventInput | null {
    return matchPlayerEventDispatch[hook]({
        state,
        player,
        getPlayerSession,
        elapsedSeconds,
    });
}

function toMatchPlayerEvent(
    {
        state,
        player,
        getPlayerSession,
        elapsedSeconds,
    }: MatchPlayerEventProjectorContext,
    patch: MatchPlayerEventPatch,
): MatchEventInput | null {
    const backendPlayerId =
        getSessionPlayerId(player.id, getPlayerSession) ??
        state.playerIds.get(player.id);

    if (!backendPlayerId) return null;
    state.playerIds.set(player.id, backendPlayerId);

    const event: MatchEventInput = {
        domain: "room",
        type: patch.type,
        scope: "player",
        actorPlayerId: backendPlayerId,
        roomPlayerId: player.id,
        value: patch.value,
        occurredAt: nowIso(),
        elapsedSeconds,
    };

    if (patch.team) {
        event.team = patch.team;
    }

    return event;
}
