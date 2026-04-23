type CommandTargetPlayer = Pick<PlayerObject, "id" | "name">;

type CommandTargetResolution<TPlayer extends CommandTargetPlayer> =
    | { type: "OK"; player: TPlayer }
    | { type: "NOT_FOUND" }
    | { type: "AMBIGUOUS"; matches: TPlayer[] }
    | { type: "INVALID_TARGET" };

const MAX_TARGET_MATCHES_IN_MESSAGE = 3;

const getTargetFromId = <TPlayer extends CommandTargetPlayer>(
    players: TPlayer[],
    rawTarget: string,
): CommandTargetResolution<TPlayer> => {
    const idMatch = rawTarget.match(/^#(\d+)$/);

    if (!idMatch) {
        return { type: "INVALID_TARGET" };
    }

    const [, idValue] = idMatch;
    const targetId = Number(idValue);
    const matchedPlayer = players.find(
        (statePlayer) => statePlayer.id === targetId,
    );

    if (!matchedPlayer) {
        return { type: "NOT_FOUND" };
    }

    return { type: "OK", player: matchedPlayer };
};

const getTargetFromNameFragment = <TPlayer extends CommandTargetPlayer>(
    players: TPlayer[],
    rawTarget: string,
): CommandTargetResolution<TPlayer> => {
    const fragment = rawTarget.trim().toLowerCase();

    if (fragment.length === 0) {
        return { type: "INVALID_TARGET" };
    }

    const matches = players.filter((statePlayer) =>
        statePlayer.name.toLowerCase().includes(fragment),
    );

    if (matches.length === 0) {
        return { type: "NOT_FOUND" };
    }

    if (matches.length > 1) {
        return { type: "AMBIGUOUS", matches };
    }

    const [match] = matches;

    if (!match) {
        return { type: "NOT_FOUND" };
    }

    return { type: "OK", player: match };
};

export const resolvePlayerTarget = <TPlayer extends CommandTargetPlayer>(
    players: TPlayer[],
    rawTarget: string,
): CommandTargetResolution<TPlayer> => {
    if (rawTarget.startsWith("#")) {
        return getTargetFromId(players, rawTarget);
    }

    return getTargetFromNameFragment(players, rawTarget);
};

export const formatTargetMatches = <TPlayer extends CommandTargetPlayer>(
    players: TPlayer[],
): string =>
    players
        .slice(0, MAX_TARGET_MATCHES_IN_MESSAGE)
        .map((player) => `${player.name} (#${player.id})`)
        .join(", ");

export type { CommandTargetPlayer, CommandTargetResolution };
