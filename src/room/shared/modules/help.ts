import { COLOR } from "@common/general/color";
import { COMMAND_PREFIX, normalizeCommandToken } from "@core/commands";
import { createModule, type Module } from "@core/module";
import { t } from "@lingui/core/macro";
import type { RoomAuthorization } from "../domain/authorization";
import { CommandCategory } from "../domain/command-categories";

export function createHelpModule({
    authorization,
}: {
    authorization: RoomAuthorization;
}): Module {
    return createModule()
        .setCommands({
            spec: { prefix: COMMAND_PREFIX },
            commands: [
                {
                    name: "help",
                    category: CommandCategory.Room,
                    description: t`Show available commands or details for one command`,
                },
            ],
        })
        .onPlayerSendCommand((room, player, command) => {
            if (command.name !== "help") {
                return { hideMessage: false };
            }

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
                    cmds.map((cmd) => `${COMMAND_PREFIX}${cmd.name}`).join(" ");

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

                if (authorization.canSeeManagementCommands(player)) {
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
                (commandIsAdminOnly &&
                    !authorization.canSeeManagementCommands(player));

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
        });
}
