import { COLOR } from "@common/general/color";
import { COMMAND_PREFIX } from "@core/commands";
import { createModule, type Module } from "@core/module";
import { t } from "@lingui/core/macro";
import { randomBytes } from "node:crypto";
import type { OfficialAdminRegistry } from "../domain/admin-registry";
import { CommandCategory } from "../domain/command-categories";

export function createGeneratedAdminModule({
    officialAdmins,
}: {
    officialAdmins: OfficialAdminRegistry;
}): Module {
    const adminPassword = randomBytes(4).toString("hex");

    return createModule()
        .setCommands({
            spec: { prefix: COMMAND_PREFIX },
            commands: [
                {
                    name: "admin",
                    category: CommandCategory.Hidden,
                },
            ],
        })
        .onRoomLink(() => {
            console.log(`Admin password: ${adminPassword}`);
        })
        .onPlayerSendCommand((room, player, command) => {
            if (command.name !== "admin") {
                return { hideMessage: false };
            }

            const password = command.args[0];

            if (password === adminPassword) {
                room.setAdmin(player, true);
                room.send({
                    message: t`✅ You are now an admin.`,
                    color: COLOR.SUCCESS,
                    to: player.id,
                });
                officialAdmins.mark(player);
            } else {
                room.send({
                    message: t`❌ Incorrect password.`,
                    color: COLOR.ERROR,
                    to: player.id,
                });
            }

            return { hideMessage: true };
        });
}
