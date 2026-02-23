import { GameState } from "@runtime/engine";
import { $dispose, $effect, $next } from "@runtime/runtime";
import {
    DownState,
    incrementDownState,
    processDownEventIncrement,
    withLastBallYAtCenter,
} from "@meta/legacy/shared/down";
import { ticks } from "@common/general/time";
import { AVATARS } from "@common/game/game";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/shared/message";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";

export function BlockedPass({
    blockerId,
    downState,
}: {
    blockerId: number;
    downState: DownState;
}) {
    const { offensiveTeam, fieldPos, downAndDistance } = downState;

    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);
    $setBallInactive();

    $dispose(() => {
        $unsetLineOfScrimmage();
        $setBallActive();
        $unsetFirstDownLine();
    });

    function command(player: PlayerObject, spec: CommandSpec) {
        return $createSharedCommandHandler({
            options: {
                undo: true,
                info: { downState },
            },
            player,
            spec,
        });
    }

    function run(state: GameState) {
        const blocker = state.players.find((p) => p.id === blockerId);
        if (!blocker) return;

        const { event, downState: baseDownState } =
            incrementDownState(downState);
        const nextDownState = withLastBallYAtCenter(baseDownState);

        $effect(($) => {
            $.setAvatar(blockerId, AVATARS.CONSTRUCTION);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(blockerId, null);
            });
        });

        processDownEventIncrement({
            event,
            onNextDown() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "🚧",
                            nextDownState,
                            t`pass batted by ${blocker.name}`,
                            t`no gain.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });
            },
            onTurnoverOnDowns() {
                $effect(($) => {
                    $.send({
                        message: cn(
                            "🚧",
                            nextDownState,
                            t`pass batted by ${blocker.name}`,
                            t`TURNOVER ON DOWNS!`,
                        ),
                        color: COLOR.WARNING,
                    });
                });
            },
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: nextDownState,
            },
            wait: ticks({ seconds: 1 }),
        });
    }

    return { run, command };
}
