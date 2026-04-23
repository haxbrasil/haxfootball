import { $effect } from "@runtime/runtime";
import { $global } from "@meta/legacy/hooks/global";
import { cn } from "@meta/legacy/shared/message";
import type { SharedCommandImplementation } from "@meta/legacy/shared/commands/types";

export const scoreCommandHandler: SharedCommandImplementation = ({
    player,
}) => {
    const { scores } = $global();

    $effect(($) => {
        $.send(cn("🏈", scores), player.id);
    });

    return { handled: true };
};
