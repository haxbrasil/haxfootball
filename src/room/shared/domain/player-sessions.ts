export type PlayerSessionAccount = {
    name: string;
    permissions?: readonly string[];
};

export type ResolvingPlayerSession = {
    kind: "resolving";
    token: symbol;
};

export type SigningInPlayerSession = {
    kind: "signing-in";
    account: PlayerSessionAccount;
    playerId: string;
    timeout: ReturnType<typeof setTimeout>;
};

export type SignedInPlayerSession = {
    kind: "signed-in";
    account: PlayerSessionAccount;
    playerId: string;
};

export type GuestPlayerSession = {
    kind: "guest";
    playerId: string;
};

export type PlayerSession =
    | ResolvingPlayerSession
    | SigningInPlayerSession
    | SignedInPlayerSession
    | GuestPlayerSession;

export type PlayerSessionReader = (playerId: number) => PlayerSession | null;

export type PlayerPlayBlockedReason =
    | "none"
    | "guest"
    | "resolving"
    | "signing-in";

export type PlayerPlayEligibility = {
    playable: boolean;
    playBlockedReason: PlayerPlayBlockedReason;
};

export function getPlayerPlayEligibility({
    allowGuestPlay,
    managedRoom,
    session,
}: {
    allowGuestPlay: boolean;
    managedRoom: boolean;
    session: PlayerSession | null;
}): PlayerPlayEligibility {
    if (!managedRoom) {
        return { playable: true, playBlockedReason: "none" };
    }

    switch (session?.kind) {
        case "signed-in":
            return { playable: true, playBlockedReason: "none" };
        case "guest":
            return allowGuestPlay
                ? { playable: true, playBlockedReason: "none" }
                : { playable: false, playBlockedReason: "guest" };
        case "signing-in":
            return { playable: false, playBlockedReason: "signing-in" };
        case "resolving":
        case undefined:
            return { playable: false, playBlockedReason: "resolving" };
    }
}

export type PlayerSessionStore = {
    get: PlayerSessionReader;
    set(playerId: number, session: PlayerSession): void;
    delete(playerId: number): void;
};

export function createPlayerSessionStore(): PlayerSessionStore {
    const sessions = new Map<number, PlayerSession>();

    return {
        get: (playerId) => sessions.get(playerId) ?? null,
        set: (playerId, session) => {
            sessions.set(playerId, session);
        },
        delete: (playerId) => {
            sessions.delete(playerId);
        },
    };
}
