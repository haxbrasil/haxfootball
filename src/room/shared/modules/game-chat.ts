import { COLOR } from "@common/general/color";
import { Room } from "@core/room";
import type { Engine } from "@runtime/engine";
import { Team } from "@runtime/models";
import type { Module } from "@core/module";
import type { PlayerSessionReader } from "../domain/player-sessions";

const TEAM_CHAT_PREFIX = {
    SHORT: ";",
    WORD: "t ",
} as const;

const getPlayerTeamPrefix = (team: number): string => {
    switch (team) {
        case Team.RED:
            return "🟥";
        case Team.BLUE:
            return "🟦";
        default:
            return "⬜";
    }
};

const getChatDisplayName = (
    getPlayerSession: PlayerSessionReader,
    player: PlayerObject,
): string => {
    const session = getPlayerSession(player.id);

    if (session?.kind === "signed-in") {
        return `${getPlayerTeamPrefix(player.team)} ${player.name}`;
    }

    if (session?.kind === "guest") {
        return `✖️ ${player.name}`;
    }

    return player.name;
};

const formatChatMessage = (
    getPlayerSession: PlayerSessionReader,
    player: PlayerObject,
    rawMessage: string,
): string => `${getChatDisplayName(getPlayerSession, player)}: ${rawMessage}`;

const getMentionedPlayerIds = (
    message: string,
    players: PlayerObject[],
): Set<number> => {
    const mentions = message.match(/@\S+/g);

    if (!mentions) return new Set();

    const mentionedIds = new Set<number>();

    for (const mention of mentions) {
        const mentionName = mention.slice(1).replace(/_/g, " ").toLowerCase();

        for (const player of players) {
            if (player.name.toLowerCase() === mentionName) {
                mentionedIds.add(player.id);
            }
        }
    }

    return mentionedIds;
};

const broadcastChat = (
    room: Room,
    rawMessage: string,
    formatMessage: (rawMessage: string) => string,
): void => {
    const message = formatMessage(rawMessage);
    const players = room.getPlayerList();
    const mentionedIds = getMentionedPlayerIds(rawMessage, players);

    if (mentionedIds.size === 0) {
        room.send({ message });
        return;
    }

    for (const p of players) {
        if (mentionedIds.has(p.id)) {
            room.send({
                message,
                to: p.id,
                style: "bold",
                sound: "notification",
            });
        } else {
            room.send({ message, to: p.id });
        }
    }
};

const parseTeamChatMessage = (
    player: PlayerObject,
    rawMessage: string,
): { message: string; target: "red" | "blue" } | null => {
    const isTeamPlayer = player.team === Team.RED || player.team === Team.BLUE;

    if (!isTeamPlayer) {
        return null;
    }

    if (rawMessage.startsWith(TEAM_CHAT_PREFIX.SHORT)) {
        return {
            message: rawMessage.slice(TEAM_CHAT_PREFIX.SHORT.length),
            target: player.team === Team.RED ? "red" : "blue",
        };
    }

    if (rawMessage.startsWith(TEAM_CHAT_PREFIX.WORD)) {
        return {
            message: rawMessage.slice(TEAM_CHAT_PREFIX.WORD.length),
            target: player.team === Team.RED ? "red" : "blue",
        };
    }

    return null;
};

export function registerGameChatHandlers(
    module: Module,
    {
        getEngine,
        getPlayerSession,
        syncGameScore,
    }: {
        getEngine: () => Engine<unknown> | null;
        getPlayerSession: PlayerSessionReader;
        syncGameScore(room: Room): void;
    },
): Module {
    return module
        .onPlayerChat((room, player, rawMessage) => {
            const teamChat = parseTeamChatMessage(player, rawMessage);

            if (!teamChat) {
                return;
            }

            room.send({
                message: `☎️ ${getChatDisplayName(getPlayerSession, player)}: ${teamChat.message}`,
                color: COLOR.ALERT,
                to: teamChat.target,
                sound: "notification",
            });

            return false;
        })
        .onPlayerChat((room, player, rawMessage) => {
            if (getEngine()) {
                return;
            }

            const format = (raw: string) =>
                formatChatMessage(getPlayerSession, player, raw);
            broadcastChat(room, rawMessage, format);

            return false;
        })
        .onPlayerChat((room, player, rawMessage) => {
            const engine = getEngine();

            if (!engine) {
                return;
            }

            const format = (raw: string) =>
                formatChatMessage(getPlayerSession, player, raw);
            const broadcast = () => broadcastChat(room, rawMessage, format);

            const chatResult = engine.handlePlayerChat(
                player,
                rawMessage,
                broadcast,
            );
            syncGameScore(room);

            if (chatResult.allowBroadcast && !chatResult.sentBeforeHooks) {
                broadcast();
            }

            return false;
        });
}
