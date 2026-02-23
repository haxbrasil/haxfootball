import { GameState } from "@runtime/engine";
import { $dispose, $next } from "@runtime/runtime";
import { DownState } from "@meta/legacy/shared/down";
import { ticks } from "@common/general/time";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import type { CommandSpec } from "@core/commands";

const TIME_TO_BLOCKED_PASS_STATE = ticks({ milliseconds: 200 });

export function PassDeflection({
    blockTime,
    blockerId,
    downState,
    isKickingBall: isInitialKickingBall,
}: {
    blockTime: number;
    blockerId: number;
    downState: DownState;
    isKickingBall: boolean;
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

    // TODO: Check if player leaves

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

        if (isInitialKickingBall || blocker.isKickingBall) {
            $next({
                to: "INTERCEPTION_ATTEMPT",
                params: {
                    playerId: blockerId,
                    kickTime: state.tickNumber,
                    downState,
                    kickBallState: state.ball,
                },
            });
        }

        if (state.tickNumber - blockTime >= TIME_TO_BLOCKED_PASS_STATE) {
            $next({
                to: "BLOCKED_PASS",
                params: {
                    blockerId: blockerId,
                    downState,
                },
            });
        }
    }

    return { run, command };
}
