import { COLOR } from "@common/general/color";
import { COMMAND_PREFIX } from "@core/commands";
import { createModule, type Module } from "@core/module";
import { t } from "@lingui/core/macro";
import { CommandCategory } from "@room/shared/domain/command-categories";
import type { ManagedRoomAuthorization } from "../domain/authorization";

export function createManagedAdminModule({
    authorization,
}: {
    authorization: ManagedRoomAuthorization;
}): Module {
    return createModule()
        .setCommands({
            spec: { prefix: COMMAND_PREFIX },
            commands: [
                {
                    name: "admin",
                    category: CommandCategory.Admin,
                    description: t`Toggle HaxBall admin mode`,
                },
            ],
        })
        .onPlayerSendCommand((room, player, command) => {
            if (command.name !== "admin") {
                return { hideMessage: false };
            }

            if (!authorization.hasRoomAdminPermission(player.id)) {
                room.send({
                    message: t`🚫 You do not have permission to use this command.`,
                    color: COLOR.ERROR,
                    to: player.id,
                });
                return { hideMessage: true };
            }

            const nextAdminState = !player.admin;

            room.setAdmin(player, nextAdminState);
            room.send({
                message: nextAdminState
                    ? t`✅ HaxBall admin mode enabled.`
                    : t`✅ HaxBall admin mode disabled.`,
                color: COLOR.SUCCESS,
                to: player.id,
            });

            return { hideMessage: true };
        });
}
