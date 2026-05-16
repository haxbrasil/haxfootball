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
