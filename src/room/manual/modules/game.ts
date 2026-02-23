import { createModule } from "@core/module";
import { COMMAND_PREFIX } from "@runtime/commands";
import { createEngine, type Engine } from "@runtime/engine";
import { registry, stadium } from "@meta/legacy/meta";
import {
    createConfig,
    defaultConfig,
    getConfigFlagDescription,
    getConfigFlagNames,
    getConfigFlagValue,
    hasConfigFlag,
    setConfigFlagValue,
    type Config,
    type ConfigFlagName,
} from "@meta/legacy/config";
import { Team } from "@runtime/models";
import { legacyGlobalSchema } from "@meta/legacy/global";
import { t } from "@lingui/core/macro";
import { Room } from "@core/room";
import { COLOR } from "@common/general/color";
import { cn, formatTeamName } from "@meta/legacy/shared/message";
import { type ScoreState } from "@common/game/game";
import { type GlobalSchemaState } from "@runtime/global";

type LegacyGlobalSnapshot = GlobalSchemaState<typeof legacyGlobalSchema>;

const gameConfig = createConfig(defaultConfig);

const TRUE_FLAG_VALUES = new Set([
    "1",
    "true",
    "on",
    "yes",
    "enabled",
    "enable",
]);
const FALSE_FLAG_VALUES = new Set([
    "0",
    "false",
    "off",
    "no",
    "disabled",
    "disable",
]);

const getPlayerNamePrefix = (team: number): string => {
    switch (team) {
        case Team.RED:
            return "🟥";
        case Team.BLUE:
            return "🟦";
        default:
            return "⬜";
    }
};

const formatChatMessage = (player: PlayerObject, rawMessage: string): string =>
    `${getPlayerNamePrefix(player.team)} ${player.name}: ${rawMessage}`;

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

const parseFlagName = (name: string | undefined): ConfigFlagName | null => {
    if (!name) return null;

    const normalizedName = name
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");

    if (!hasConfigFlag(normalizedName)) {
        return null;
    }

    return normalizedName;
};

const parseFlagValue = (value: string | undefined): boolean | null => {
    if (!value) return null;

    const normalizedValue = value.trim().toLowerCase();

    if (TRUE_FLAG_VALUES.has(normalizedValue)) {
        return true;
    }

    if (FALSE_FLAG_VALUES.has(normalizedValue)) {
        return false;
    }

    return null;
};

const toFlagState = (value: boolean): "ON" | "OFF" => {
    return value ? "ON" : "OFF";
};

const getFinalScoreAnnouncement = (score: ScoreState): string => {
    if (score[Team.RED] === score[Team.BLUE]) {
        return cn("🏁", score, t`Game ended in a tie!`);
    }

    const winnerTeam =
        score[Team.RED] > score[Team.BLUE] ? Team.RED : Team.BLUE;

    return cn(
        "🏁",
        score,
        t`Victory for the ${formatTeamName(winnerTeam)} team!`,
    );
};

let engine: Engine<Config> | null = null;

const gameModule = createModule()
    .setCommands({
        spec: { prefix: COMMAND_PREFIX },
        commands: [
            "punt",
            "fg",
            "distance",
            "down",
            "los",
            "version",
            "undo",
            "info",
            "reposition",
            "score",
            "flag",
            "flags",
        ],
    })
    .onGameStart((room) => {
        engine = createEngine(room, registry, {
            config: gameConfig,
            globalSchema: legacyGlobalSchema,
        });

        engine.start("KICKOFF", { forTeam: Team.RED });
    })
    .onGameTick(() => {
        engine?.tick();
    })
    .onPlayerBallKick((_room, player) => {
        engine?.trackPlayerBallKick(player.id);
    })
    .onPlayerSendCommand((room, player, command) => {
        const { handled: handledByEngine } = engine
            ? engine.handlePlayerCommand(player, command)
            : { handled: false };

        if (handledByEngine) {
            return { hideMessage: true };
        }

        switch (command.name) {
            case "flags": {
                const flagNames = getConfigFlagNames();

                const [enabledFlags, disabledFlags] = flagNames.reduce<
                    [ConfigFlagName[], ConfigFlagName[]]
                >(
                    (acc, flagName) => {
                        if (getConfigFlagValue(gameConfig, flagName)) {
                            acc[0].push(flagName);
                        } else {
                            acc[1].push(flagName);
                        }

                        return acc;
                    },
                    [[], []],
                );

                if (enabledFlags.length === 0) {
                    room.send({
                        message: t`⚙️ Available flags: ${flagNames.join(", ") || t`none`}.`,
                        color: COLOR.SYSTEM,
                        to: player.id,
                    });

                    return { hideMessage: true };
                }

                room.send({
                    message: t`⚙️ Available flags:`,
                    color: COLOR.SYSTEM,
                    to: player.id,
                });

                room.send({
                    message: t`• Enabled: ${enabledFlags.join(", ") || t`none`}`,
                    color: COLOR.SYSTEM,
                    to: player.id,
                });

                room.send({
                    message: t`• Disabled: ${disabledFlags.join(", ") || t`none`}`,
                    color: COLOR.SYSTEM,
                    to: player.id,
                });

                return { hideMessage: true };
            }
            case "flag": {
                if (!command.args[0]) {
                    room.send({
                        message: t`⚠️ Usage: !flag <FLAG_NAME> [VALUE].`,
                        color: COLOR.WARNING,
                        to: player.id,
                    });

                    return { hideMessage: true };
                }

                const requestedFlagName = parseFlagName(command.args[0]);

                if (!requestedFlagName) {
                    room.send({
                        message: t`⚠️ Unknown flag. Use !flags to list available flags.`,
                        color: COLOR.WARNING,
                        to: player.id,
                    });

                    return { hideMessage: true };
                }

                const requestedFlagValue = command.args[1];

                const flagDescription =
                    getConfigFlagDescription(requestedFlagName);

                const flagState = toFlagState(
                    getConfigFlagValue(gameConfig, requestedFlagName),
                );

                if (requestedFlagValue === undefined) {
                    room.send({
                        message: t`⚙️ ${requestedFlagName}: ${flagState}.`,
                        color: COLOR.SYSTEM,
                        to: player.id,
                    });

                    room.send({
                        message: `ℹ️ ${flagDescription}`,
                        color: COLOR.SYSTEM,
                        to: player.id,
                    });

                    return { hideMessage: true };
                }

                if (!player.admin) {
                    room.send({
                        message: t`⚠️ Only admins can modify flags.`,
                        color: COLOR.WARNING,
                        to: player.id,
                    });

                    return { hideMessage: true };
                }

                if (engine?.isRunning()) {
                    room.send({
                        message: t`⚠️ Flags cannot be changed while a game is in progress.`,
                        color: COLOR.WARNING,
                        to: player.id,
                    });

                    return { hideMessage: true };
                }

                const parsedFlagValue = parseFlagValue(requestedFlagValue);

                if (parsedFlagValue === null) {
                    room.send({
                        message: t`⚠️ Invalid value. Use true/false, on/off, 1/0, yes/no.`,
                        color: COLOR.WARNING,
                        to: player.id,
                    });

                    return { hideMessage: true };
                }

                setConfigFlagValue(
                    gameConfig,
                    requestedFlagName,
                    parsedFlagValue,
                );

                const newFlagState = toFlagState(parsedFlagValue);

                room.send({
                    message: t`⚙️ ${player.name} set ${requestedFlagName} to ${newFlagState}.`,
                    color: COLOR.ALERT,
                });

                room.send({
                    message: `ℹ️ ${requestedFlagName}: ${flagDescription}`,
                    color: COLOR.SYSTEM,
                });

                return { hideMessage: true };
            }
            case "version":
                room.send({
                    message: t`🏈 HaxFootball 2026`,
                    color: COLOR.SYSTEM,
                    to: player.id,
                });

                return { hideMessage: true };
            default:
                room.send({
                    message: engine
                        ? t`⚠️ You cannot use that command right now.`
                        : t`⚠️ The game has not been started yet.`,
                    color: COLOR.WARNING,
                    to: player.id,
                });

                return { hideMessage: true };
        }
    })
    .onPlayerChat((room, player, rawMessage) => {
        const isTeamPlayer =
            player.team === Team.RED || player.team === Team.BLUE;
        const isTeamChat =
            isTeamPlayer &&
            (rawMessage.startsWith(";") || rawMessage.startsWith("t "));

        if (!isTeamChat) {
            return;
        }

        const teamMessage = rawMessage.startsWith(";")
            ? rawMessage.slice(1)
            : rawMessage.slice(2);
        const teamTarget = player.team === Team.RED ? "red" : "blue";

        room.send({
            message: `☎️ ${player.name}: ${teamMessage}`,
            color: COLOR.ALERT,
            to: teamTarget,
            sound: "notification",
        });

        return false;
    })

    .onPlayerChat((room, player, rawMessage) => {
        if (engine) {
            return;
        }

        const format = (raw: string) => formatChatMessage(player, raw);
        broadcastChat(room, rawMessage, format);

        return false;
    })
    .onPlayerChat((room, player, rawMessage) => {
        const format = (raw: string) => formatChatMessage(player, raw);
        const broadcast = () => broadcastChat(room, rawMessage, format);

        if (!engine) {
            return;
        }

        const chatResult = engine.handlePlayerChat(
            player,
            rawMessage,
            broadcast,
        );

        if (chatResult.allowBroadcast && !chatResult.sentBeforeHooks) {
            broadcast();
        }

        return false;
    })
    .onPlayerTeamChange((_room, changedPlayer, byPlayer) => {
        engine?.handlePlayerTeamChange(changedPlayer, byPlayer);
    })
    .onPlayerLeave((_room, player) => {
        engine?.handlePlayerLeave(player);
    })
    .onGameStop((room) => {
        const snapshot = engine?.getGlobalStateSnapshot<LegacyGlobalSnapshot>();
        const score = snapshot?.scores ?? null;

        const shouldShowScore = score && score[Team.RED] + score[Team.BLUE] > 0;

        if (shouldShowScore) {
            const announcement = getFinalScoreAnnouncement(score);

            room.send({
                message: announcement,
                color:
                    score[Team.RED] === score[Team.BLUE]
                        ? COLOR.SYSTEM
                        : COLOR.SUCCESS,
                to: "mixed",
                sound: "notification",
                style: "bold",
            });
        }

        engine?.stop();
        engine = null;
    })
    .onGamePause((_room, byPlayer) => {
        engine?.handleGamePause(byPlayer);
    })
    .onGameUnpause((_room, byPlayer) => {
        engine?.handleGameUnpause(byPlayer);
    })
    .onRoomLink((room) => {
        room.setStadium(stadium);
    })
    .onStadiumChange((_room, _newStadiumName, byPlayer) => {
        if (byPlayer) {
            return { undo: true };
        }

        return { undo: false };
    });

export const modules = [gameModule];
