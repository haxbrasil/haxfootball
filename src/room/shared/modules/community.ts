import { COLOR } from "@common/general/color";
import { COMMAND_PREFIX } from "@core/commands";
import { createModule, type Module } from "@core/module";
import { env } from "@env/room";
import { t } from "@lingui/core/macro";
import { CommandCategory } from "../domain/command-categories";

export function createCommunityModule(): Module {
    return createModule()
        .setCommands({
            spec: { prefix: COMMAND_PREFIX },
            commands: [
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
            ],
        })
        .onPlayerSendCommand((room, player, command) => {
            switch (command.name) {
                case "discord":
                    room.send({
                        message: t`💬 Join our Discord server: ${env.DISCORD_LINK}`,
                        color: COLOR.ACTION,
                    });

                    return { hideMessage: false };
                case "tutorial":
                    room.send({
                        message: t`🎬 Watch the tutorial: ${env.TUTORIAL_LINK}`,
                        color: COLOR.ACTION,
                    });

                    return { hideMessage: false };
                case "bb":
                    room.send({
                        message: t`🙂 Stay a little longer with us!`,
                        color: COLOR.HIGHLIGHT,
                        to: player.id,
                        sound: "none",
                    });

                    return { hideMessage: true };
                default:
                    return { hideMessage: false };
            }
        })
        .onPlayerJoin((room, player) => {
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
        });
}
