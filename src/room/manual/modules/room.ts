import { createModule } from "@core/module";
import { COMMAND_PREFIX, normalizeCommandToken } from "@core/commands";
import { t } from "@lingui/core/macro";
import { randomBytes } from "node:crypto";
import { Room } from "@core/room";
import { COLOR } from "@common/general/color";
import { env } from "@env";
import { CommandCategory } from "../utils/commands";

const ADMIN_PASSWORD = randomBytes(4).toString("hex");

const admins = new Set<number>();
const adminIps = new Set<string>();

const manageAdmin = (room: Room) => {
    if (!room.getPlayerList().some((p) => p.admin)) {
        const player = room.getPlayerList()[0];

        if (player) {
            room.setAdmin(player, true);
        }
    }
};

const mainModule = createModule()
    .setCommands({
        spec: { prefix: COMMAND_PREFIX },
        commands: [
            {
                name: "admin",
                category: CommandCategory.Hidden,
            },
            {
                name: "setpassword",
                category: CommandCategory.Admin,
                description: t`Set the room password`,
            },
            {
                name: "clearpassword",
                category: CommandCategory.Admin,
                description: t`Remove the room password`,
            },
            {
                name: "discord",
                category: CommandCategory.Room,
                description: t`Show the Discord invite link`,
            },
            {
                name: "tutorial",
                category: CommandCategory.Room,
                description: t`Show the tutorial link`,
            },
            {
                name: "bb",
                category: CommandCategory.Hidden,
            },
            {
                name: "clearbans",
                category: CommandCategory.Admin,
                description: t`Clear all bans`,
            },
            {
                name: "help",
                category: CommandCategory.Room,
                description: t`Show available commands or details for one command`,
            },
        ],
    })
    .onRoomLink((room, url) => {
        if (env.DEBUG) {
            console.warn("Running in debug mode.");
        }

        console.log(`Room link: ${url}`);
        console.log(`Admin password: ${ADMIN_PASSWORD}`);

        room.lockTeams();
        room.setScoreLimit(0);
        room.setTimeLimit(10);
    })
    .onPlayerSendCommand((room, player, command) => {
        switch (command.name) {
            case "admin": {
                const password = command.args[0];

                if (password === ADMIN_PASSWORD) {
                    room.setAdmin(player, true);
                    room.send({
                        message: t`✅ You are now an admin.`,
                        color: COLOR.SUCCESS,
                        to: player.id,
                    });
                    admins.add(player.id);
                    adminIps.add(player.ip);
                } else {
                    room.send({
                        message: t`❌ Incorrect password.`,
                        color: COLOR.ERROR,
                        to: player.id,
                    });
                }

                return { hideMessage: true };
            }
            case "setpassword": {
                const newPassword = command.args[0];

                if (!player.admin) {
                    room.send({
                        message: t`🚫 You must be an admin to use this command.`,
                        color: COLOR.ERROR,
                        to: player.id,
                    });
                    return { hideMessage: true };
                }

                if (!newPassword) {
                    room.send({
                        message: t`⚠️ Please provide a new password.`,
                        color: COLOR.WARNING,
                        to: player.id,
                    });
                    return { hideMessage: true };
                }

                room.setPassword(newPassword);
                room.send({
                    message: t`✅ Password updated successfully.`,
                    color: COLOR.SUCCESS,
                    to: player.id,
                });

                return { hideMessage: true };
            }
            case "clearpassword": {
                if (!player.admin) {
                    room.send({
                        message: t`🚫 You must be an admin to use this command.`,
                        color: COLOR.ERROR,
                        to: player.id,
                    });
                    return { hideMessage: true };
                }

                room.removePassword();
                room.send({
                    message: t`✅ Password cleared successfully.`,
                    color: COLOR.SUCCESS,
                    to: player.id,
                });

                return { hideMessage: true };
            }
            case "discord": {
                room.send({
                    message: t`💬 Join our Discord server: ${env.DISCORD_LINK}`,
                    color: COLOR.ACTION,
                });

                return { hideMessage: false };
            }
            case "tutorial": {
                room.send({
                    message: t`🎬 Watch the tutorial: ${env.TUTORIAL_LINK}`,
                    color: COLOR.ACTION,
                });

                return { hideMessage: false };
            }
            case "bb": {
                room.send({
                    message: t`🙂 Stay a little longer with us!`,
                    color: COLOR.HIGHLIGHT,
                    to: player.id,
                    sound: "none",
                });

                return { hideMessage: true };
            }
            case "clearbans": {
                if (!player.admin) {
                    room.send({
                        message: t`🚫 You must be an admin to use this command.`,
                        color: COLOR.ERROR,
                        to: player.id,
                    });
                    return { hideMessage: true };
                }

                room.clearBans();

                room.send({
                    message: t`✅ All bans cleared successfully.`,
                    color: COLOR.SUCCESS,
                    to: player.id,
                });

                return { hideMessage: true };
            }
            case "help": {
                const commands = room.getCommands();
                const [requestedCommandName] = command.args;

                if (!requestedCommandName) {
                    const gameCommands = commands.filter(
                        (cmd) => cmd.category === CommandCategory.Game,
                    );
                    const roomCommands = commands.filter(
                        (cmd) => cmd.category === CommandCategory.Room,
                    );
                    const adminCommands = commands.filter(
                        (cmd) => cmd.category === CommandCategory.Admin,
                    );

                    const formatCommands = (cmds: typeof commands) =>
                        cmds
                            .map((cmd) => `${COMMAND_PREFIX}${cmd.name}`)
                            .join(" ");

                    room.send({
                        message: t`📋 Available commands:`,
                        color: COLOR.HIGHLIGHT,
                        to: player.id,
                        sound: "notification",
                    });
                    room.send({
                        message: t`🏈 Game: ${formatCommands(gameCommands)}`,
                        color: COLOR.HIGHLIGHT,
                        to: player.id,
                        sound: "notification",
                    });
                    room.send({
                        message: t`💬 Room: ${formatCommands(roomCommands)}`,
                        color: COLOR.HIGHLIGHT,
                        to: player.id,
                        sound: "notification",
                    });

                    if (player.admin) {
                        room.send({
                            message: t`🔒 Admin: ${formatCommands(adminCommands)}`,
                            color: COLOR.HIGHLIGHT,
                            to: player.id,
                            sound: "notification",
                        });
                    }

                    return { hideMessage: true };
                }

                const normalizedRequestedName = normalizeCommandToken(
                    requestedCommandName.startsWith(COMMAND_PREFIX)
                        ? requestedCommandName.slice(COMMAND_PREFIX.length)
                        : requestedCommandName,
                );

                const matchedCommand = commands.find(
                    (cmd) =>
                        cmd.name === normalizedRequestedName ||
                        cmd.aliases.includes(normalizedRequestedName),
                );

                const commandIsHidden =
                    matchedCommand?.category === CommandCategory.Hidden;

                const commandIsAdminOnly =
                    matchedCommand?.category === CommandCategory.Admin;

                const shouldHideCommandDescription =
                    !matchedCommand ||
                    commandIsHidden ||
                    (commandIsAdminOnly && !player.admin);

                if (shouldHideCommandDescription) {
                    room.send({
                        message: t`⚠️ Unknown command. Use !help to see available commands.`,
                        color: COLOR.WARNING,
                        to: player.id,
                        sound: "notification",
                    });

                    return { hideMessage: true };
                }

                room.send({
                    message: matchedCommand.description
                        ? t`📘 ${COMMAND_PREFIX}${matchedCommand.name}: ${matchedCommand.description}`
                        : t`📘 ${COMMAND_PREFIX}${matchedCommand.name}: No description available.`,
                    color: COLOR.HIGHLIGHT,
                    to: player.id,
                    sound: "notification",
                });

                const formattedAliases = matchedCommand.aliases
                    .map((alias) => `${COMMAND_PREFIX}${alias}`)
                    .join(" ");

                if (matchedCommand.aliases.length > 0) {
                    room.send({
                        message: t`🔁 Aliases: ${formattedAliases}`,
                        color: COLOR.HIGHLIGHT,
                        to: player.id,
                        sound: "none",
                    });
                }

                return { hideMessage: true };
            }
            default:
                return { hideMessage: false };
        }
    })
    .onPlayerJoin((room, player) => {
        console.log(`${player.name} has joined (${player.ip})`);

        if (!env.DEBUG) {
            const duplicate = room
                .getPlayerList()
                .find((p) => p.id !== player.id && p.ip === player.ip);

            if (duplicate) {
                room.kick(player, t`Already connected (${duplicate.name}).`);
                return;
            }

            manageAdmin(room);
        } else {
            room.setAdmin(player, true);
        }

        room.send({
            message: t`🏈 Welcome to HaxFootball!`,
            color: COLOR.SYSTEM,
            to: player.id,
            sound: "notification",
        });
        room.send({
            message: t`🎬 Watch the tutorial: ${env.TUTORIAL_LINK}`,
            color: COLOR.HIGHLIGHT,
            to: player.id,
            sound: "none",
        });
        room.send({
            message: t`💬 Join our Discord server: ${env.DISCORD_LINK}`,
            color: COLOR.ACTION,
            to: player.id,
            sound: "none",
        });
    })
    .onPlayerLeave((room, player) => {
        manageAdmin(room);

        console.log(`${player.name} has left`);
    })
    .onPlayerAdminChange((room) => {
        manageAdmin(room);
    })
    .onBeforeKick((room, kickedPlayer, _reason, ban, byPlayer) => {
        if (
            kickedPlayer &&
            adminIps.has(kickedPlayer.ip) &&
            !admins.has(byPlayer.id)
        ) {
            room.send({
                message: ban
                    ? t`⚠️ You cannot ban this player.`
                    : t`⚠️ You cannot kick this player.`,
                color: COLOR.WARNING,
                to: byPlayer.id,
                sound: "notification",
            });

            return false;
        }

        if (ban && !admins.has(byPlayer.id)) {
            room.send({
                message: t`🚫 You are not allowed to ban players.`,
                color: COLOR.ERROR,
                to: byPlayer.id,
                sound: "notification",
            });

            return false;
        }

        return true;
    })
    .onPlayerChat((_, player, message) => {
        const time = new Date().toLocaleTimeString();
        console.log(`[${time}] ${player.name}: ${message}`);
    });

export const modules = [mainModule];
