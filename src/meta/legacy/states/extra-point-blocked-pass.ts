import type { GameState } from "@runtime/engine";
import { $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { AVATARS, type FieldPosition } from "@common/game/game";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/shared/message";
import { type FieldTeam } from "@runtime/models";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import {
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";

export function ExtraPointBlockedPass({
    blockerId,
    offensiveTeam,
    fieldPos,
}: {
    blockerId: number;
    offensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
}) {
    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();
    $setBallInactive();

    $dispose(() => {
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
    });

    function command(player: PlayerObject, spec: CommandSpec) {
        return $createSharedCommandHandler({
            options: {
                undo: true,
                info: { stateMessage: t`Extra point` },
            },
            player,
            spec,
        });
    }

    function run(state: GameState) {
        const blocker = state.players.find((player) => player.id === blockerId);
        if (!blocker) return;

        $effect(($) => {
            $.setAvatar(blockerId, AVATARS.CONSTRUCTION);
            $.send({
                message: cn(
                    t`🚧 Pass batted by ${blocker.name}`,
                    t`two-point try failed.`,
                ),
                color: COLOR.WARNING,
            });
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(blockerId, null);
            });
        });

        $next({
            to: "KICKOFF",
            params: {
                forTeam: offensiveTeam,
            },
            wait: ticks({ seconds: 2 }),
        });
    }

    return { run, command };
}
