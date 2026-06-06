import { Team } from "@runtime/models";
import type { PlayerSessionReader } from "@room/shared/domain/player-sessions";

export type ApiTeam = "spectators" | "red" | "blue";

export type ApiPlayerEventFields = {
    actorPlayerId?: string;
    roomPlayerId: number;
    occurredAt: string;
};

export function nowIso(): string {
    return new Date().toISOString();
}

export function toApiTeam(team: number): ApiTeam {
    if (team === Team.RED) return "red";
    if (team === Team.BLUE) return "blue";
    return "spectators";
}

export function isFieldTeam(team: number): boolean {
    return team === Team.RED || team === Team.BLUE;
}

export function getSessionPlayerId(
    roomPlayerId: number,
    getPlayerSession: PlayerSessionReader,
): string | null {
    const session = getPlayerSession(roomPlayerId);

    if (session?.kind === "signed-in" || session?.kind === "guest") {
        return session.playerId;
    }

    return null;
}

export function toApiPlayerEventFields({
    player,
    getPlayerSession,
}: {
    player: PlayerObject;
    getPlayerSession: PlayerSessionReader;
}): ApiPlayerEventFields {
    const backendPlayerId = getSessionPlayerId(player.id, getPlayerSession);
    const fields: ApiPlayerEventFields = {
        roomPlayerId: player.id,
        occurredAt: nowIso(),
    };

    if (backendPlayerId) {
        fields.actorPlayerId = backendPlayerId;
    }

    return fields;
}
