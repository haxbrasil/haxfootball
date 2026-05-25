import type { RoomAuthorization } from "@room/shared/domain/authorization";
import type { PlayerSessionStore } from "@room/shared/domain/player-sessions";

export const ROOM_ADMIN_PERMISSION = "room:admin";

export type ManagedRoomAuthorization = RoomAuthorization & {
    hasRoomAdminPermission(playerId: number): boolean;
};

export function createManagedAuthorization({
    sessionStore,
}: {
    sessionStore: PlayerSessionStore;
}): ManagedRoomAuthorization {
    const hasRoomAdminPermission = (playerId: number): boolean => {
        const session = sessionStore.get(playerId);

        return (
            session?.kind === "signed-in" &&
            session.account.permissions?.includes(ROOM_ADMIN_PERMISSION) ===
                true
        );
    };

    const canUseManagementCommand = (player: PlayerObject) =>
        hasRoomAdminPermission(player.id);

    return {
        hasRoomAdminPermission,
        canUseManagementCommand,
        canChangeGameMode: canUseManagementCommand,
        canUseGameCorrectionCommand: (player) =>
            player.admin || hasRoomAdminPermission(player.id),
        canKickOrBan: canUseManagementCommand,
        canSeeManagementCommands: canUseManagementCommand,
    };
}
