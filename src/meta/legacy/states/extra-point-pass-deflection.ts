import type { GameState } from "@runtime/engine";
import { $dispose, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { type FieldPosition } from "@common/game/game";
import { type FieldTeam } from "@runtime/models";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import { t } from "@lingui/core/macro";
import {
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import type { CommandSpec } from "@core/commands";

const TIME_TO_BLOCKED_PASS_STATE = ticks({ milliseconds: 200 });

export function ExtraPointPassDeflection({
    blockTime,
    blockerId,
    isKickingBall: isInitialKickingBall,
    offensiveTeam,
    fieldPos,
}: {
    blockTime: number;
    blockerId: number;
    isKickingBall: boolean;
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

        if (isInitialKickingBall || blocker.isKickingBall) {
            $next({
                to: "EXTRA_POINT_INTERCEPTION_ATTEMPT",
                params: {
                    playerId: blockerId,
                    kickTime: state.tickNumber,
                    offensiveTeam,
                    fieldPos,
                    kickBallState: state.ball,
                },
            });
        }

        if (state.tickNumber - blockTime >= TIME_TO_BLOCKED_PASS_STATE) {
            $next({
                to: "EXTRA_POINT_BLOCKED_PASS",
                params: {
                    blockerId,
                    offensiveTeam,
                    fieldPos,
                },
            });
        }
    }

    return { run, command };
}
