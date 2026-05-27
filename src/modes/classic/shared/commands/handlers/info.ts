import { $effect } from "@runtime/runtime";
import { $global } from "@modes/classic/hooks/global";
import { cn } from "@modes/classic/shared/message";
import type { SharedCommandImplementation } from "@modes/classic/shared/commands/types";

export const infoCommandHandler: SharedCommandImplementation = ({
    player,
    statePart,
}) => {
    const { scores } = $global();

    $effect(($) => {
        $.send(cn("📋", statePart, scores), player.id);
    });

    return { handled: true };
};
