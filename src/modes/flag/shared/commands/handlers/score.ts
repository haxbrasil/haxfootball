import { $effect } from "@runtime/runtime";
import { $global } from "@modes/flag/hooks/global";
import { cn } from "@modes/flag/shared/presentation/message";
import type { SharedCommandImplementation } from "@modes/flag/shared/commands/types";

export const scoreCommandHandler: SharedCommandImplementation = ({
    player,
}) => {
    const { scores } = $global();

    $effect(($) => {
        $.send(cn("🏈", scores), player.id);
    });

    return { handled: true };
};
