import { $effect } from "@runtime/runtime";
import { $global } from "@modes/classic/hooks/global";
import { cn } from "@modes/classic/shared/message";
import type { SharedCommandImplementation } from "@modes/classic/shared/commands/types";

export const scoreCommandHandler: SharedCommandImplementation = ({
    player,
}) => {
    const { scores } = $global();

    $effect(($) => {
        $.send(cn("🏈", scores), player.id);
    });

    return { handled: true };
};
