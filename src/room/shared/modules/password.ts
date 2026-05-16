import { COLOR } from "@common/general/color";
import { COMMAND_PREFIX } from "@core/commands";
import { createModule, type Module } from "@core/module";
import { t } from "@lingui/core/macro";
import type { RoomAuthorization } from "../domain/authorization";
import { CommandCategory } from "../domain/command-categories";

export function createPasswordModule({
    authorization,
}: {
    authorization: RoomAuthorization;
}): Module {
    return createModule()
        .setCommands({
            spec: { prefix: COMMAND_PREFIX },
            commands: [
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
            ],
        })
        .onPlayerSendCommand((room, player, command) => {
            switch (command.name) {
                case "setpassword": {
                    const newPassword = command.args[0];

                    if (!authorization.canUseManagementCommand(player)) {
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
                    if (!authorization.canUseManagementCommand(player)) {
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
                default:
                    return { hideMessage: false };
            }
        });
}
