import { COLOR } from "@common/general/color";
import { COMMAND_PREFIX } from "@core/commands";
import { createModule, type Module } from "@core/module";
import type { Room } from "@core/room";
import { env } from "@env/room";
import { t } from "@lingui/core/macro";
import type { OfficialAdminRegistry } from "../domain/admin-registry";
import type { RoomAuthorization } from "../domain/authorization";
import { CommandCategory } from "../domain/command-categories";

const manageAdmin = (room: Room) => {
    if (!room.getPlayerList().some((p) => p.admin)) {
        const player = room.getPlayerList()[0];

        if (player) {
            room.setAdmin(player, true);
        }
    }
};

export function createPlayerAccessModule({
    authorization,
    autoManageNativeAdmins,
    officialAdmins,
}: {
    authorization: RoomAuthorization;
    autoManageNativeAdmins: boolean;
    officialAdmins?: OfficialAdminRegistry;
}): Module {
    return createModule()
        .setCommands({
            spec: { prefix: COMMAND_PREFIX },
            commands: [
                {
                    name: "clearbans",
                    category: CommandCategory.Admin,
                    description: t`Clear all bans`,
                },
            ],
        })
        .onPlayerSendCommand((room, player, command) => {
            if (command.name !== "clearbans") {
                return { hideMessage: false };
            }

            if (!authorization.canUseManagementCommand(player)) {
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
        })
        .onPlayerJoin((room, player) => {
            console.log(`${player.name} has joined (${player.ip})`);

            if (!env.DEBUG) {
                const duplicate = room
                    .getPlayerList()
                    .find((p) => p.id !== player.id && p.ip === player.ip);

                if (duplicate) {
                    room.kick(
                        player,
                        t`Already connected (${duplicate.name}).`,
                    );
                    return false;
                }

                if (autoManageNativeAdmins) {
                    manageAdmin(room);
                }
            } else {
                if (autoManageNativeAdmins) {
                    room.setAdmin(player, true);
                    officialAdmins?.mark(player);
                }
            }

            return true;
        })
        .onPlayerLeave((room, player) => {
            if (autoManageNativeAdmins) {
                manageAdmin(room);
                officialAdmins?.unmark(player);
            }

            console.log(`${player.name} has left`);
        })
        .onPlayerAdminChange((room) => {
            if (autoManageNativeAdmins) {
                manageAdmin(room);
            }
        })
        .onBeforeKick((room, kickedPlayer, _reason, ban, byPlayer) => {
            if (!autoManageNativeAdmins) {
                if (authorization.canKickOrBan(byPlayer)) {
                    return true;
                }

                room.send({
                    message: ban
                        ? t`🚫 You are not allowed to ban players.`
                        : t`🚫 You are not allowed to kick players.`,
                    color: COLOR.ERROR,
                    to: byPlayer.id,
                    sound: "notification",
                });

                return false;
            }

            if (
                kickedPlayer &&
                officialAdmins?.has(kickedPlayer) &&
                !officialAdmins.has(byPlayer)
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

            if (ban && !authorization.canKickOrBan(byPlayer)) {
                room.send({
                    message: t`🚫 You are not allowed to ban players.`,
                    color: COLOR.ERROR,
                    to: byPlayer.id,
                    sound: "notification",
                });

                return false;
            }

            return true;
        });
}
