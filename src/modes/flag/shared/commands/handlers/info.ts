import { $effect } from "@runtime/runtime";
import { $global } from "@modes/flag/hooks/global";
import { cn } from "@modes/flag/shared/presentation/message";
import type { SharedCommandImplementation } from "@modes/flag/shared/commands/types";

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
