export type RoomAuthorization = {
    canUseManagementCommand(player: PlayerObject): boolean;
    canUseGameCorrectionCommand(player: PlayerObject): boolean;
    canKickOrBan(player: PlayerObject): boolean;
    canSeeManagementCommands(player: PlayerObject): boolean;
};

export function createNativeAdminAuthorization(): RoomAuthorization {
    const isNativeAdmin = (player: PlayerObject) => player.admin;

    return {
        canUseManagementCommand: isNativeAdmin,
        canUseGameCorrectionCommand: isNativeAdmin,
        canKickOrBan: isNativeAdmin,
        canSeeManagementCommands: isNativeAdmin,
    };
}
