import { GameState } from "@runtime/engine";
import { $dispose, $effect, $next, $stat } from "@runtime/runtime";
import {
    DownState,
    incrementDownState,
    processDownEventIncrement,
    withLastBallYAtCenter,
} from "@modes/classic/shared/rules/down";
import { ticks } from "@common/general/time";
import { AVATARS } from "@common/game/game";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@modes/classic/hooks/game";
import { t } from "@lingui/core/macro";
import { cn } from "@modes/classic/shared/presentation/message";
import { $createSharedCommandHandler } from "@modes/classic/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";
import { Stat } from "@modes/classic/stats";

export function BlockedPass({
    blockerId,
    downState,
    passerId,
}: {
    blockerId: number;
    downState: DownState;
    passerId?: number;
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
        $stat({
            type: Stat.PassBlocked,
            playerId: blockerId,
            value: {
                team: downState.offensiveTeam,
                down: downState.downAndDistance.down,
                distance: downState.downAndDistance.distance,
                startFieldPosition: downState.fieldPos,
                ...(passerId ? { passer: passerId } : {}),
            },
        });

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
