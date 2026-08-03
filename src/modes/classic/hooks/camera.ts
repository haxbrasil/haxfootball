import { $effect } from "@runtime/runtime";

export function $syncNativeBallCameraTarget(playerWithBallId?: number): void {
    $effect(($) => {
        $.syncNativeBallCameraTarget(playerWithBallId);
    });
}
