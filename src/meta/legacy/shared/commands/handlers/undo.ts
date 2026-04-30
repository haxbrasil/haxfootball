import { $checkpoints, $effect, $restore } from "@runtime/runtime";
import { t } from "@lingui/core/macro";
import type { SharedCommandImplementation } from "@meta/legacy/shared/commands/types";

export const undoCommandHandler: SharedCommandImplementation = ({ player }) => {
    if (!player.admin) {
        $effect(($) => {
            $.send(t`⚠️ Only admins can call for an undo.`, player.id);
        });

        return { handled: true };
    }

    const checkpoints = $checkpoints();

    if (checkpoints.length === 0) {
        $effect(($) => {
            $.send(t`⚠️ No checkpoints available to undo.`, player.id);
        });

        return { handled: true };
    }

    $effect(($) => {
        $.send(
            t`⏪ ${player.name} calls for an undo! Rewinding to the last checkpoint...`,
        );
    });

    $restore();
};
