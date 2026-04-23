import type { GameState } from "@runtime/engine";
import { $checkpoint, $dispose, $effect, $next, $tick } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { opposite, type FieldPosition } from "@common/game/game";
import { type FieldTeam, isFieldTeam } from "@runtime/models";
import { t } from "@lingui/core/macro";
import {
    BALL_OFFSET_YARDS,
    calculateSnapBallPosition,
} from "@meta/legacy/shared/stadium";
import {
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import {
    $lockBall,
    $setBallMoveable,
    $setBallUnmoveable,
    $unlockBall,
} from "@meta/legacy/hooks/physics";
import {
    buildInitialPlayerPositions,
    DEFAULT_INITIAL_POSITIONING_RELATIVE_LINES,
} from "@meta/legacy/shared/initial-positioning";
import { $global } from "@meta/legacy/hooks/global";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";
import {
    isTooFarFromBall,
    MIN_SNAP_DELAY_TICKS,
} from "@meta/legacy/shared/snap";

const EXTRA_POINT_DECISION_WINDOW = ticks({ seconds: 10 });
const EXTRA_POINT_YARD_LINE = 10;

function $setInitialPlayerPositions(
    offensiveTeam: FieldTeam,
    ballPos: Position,
) {
    const { snapProfile } = $global();

    $effect(($) => {
        const players = $.getPlayerList().flatMap((player) => {
            if (!isFieldTeam(player.team)) {
                return [];
            }

            return [
                {
                    id: player.id,
                    team: player.team,
                    position: {
                        x: player.position.x,
                        y: player.position.y,
                    },
                },
            ];
        });

        buildInitialPlayerPositions({
            players,
            offensiveTeam,
            ballPos,
            relativeLines: DEFAULT_INITIAL_POSITIONING_RELATIVE_LINES,
            snapProfile,
        }).forEach(({ id, x, y }) => {
            $.setPlayerDiscProperties(id, {
                x,
                y,
                xspeed: 0,
                yspeed: 0,
            });
        });
    });
}

type ExtraPointRetryFrame = {
    elapsedTicks: number;
};

export function ExtraPointRetry({
    offensiveTeam,
    fieldPos: fieldPosParam,
    defensiveFouls = 0,
}: {
    offensiveTeam: FieldTeam;
    fieldPos?: FieldPosition;
    defensiveFouls?: number;
}) {
    const fieldPos: FieldPosition = fieldPosParam ?? {
        yards: EXTRA_POINT_YARD_LINE,
        side: opposite(offensiveTeam),
    };
    const ballPosWithOffset = calculateSnapBallPosition(
        offensiveTeam,
        fieldPos,
        BALL_OFFSET_YARDS,
    );
    const formationBallPos = calculateSnapBallPosition(offensiveTeam, fieldPos);

    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();
    $setBallActive();
    $lockBall();
    $setBallUnmoveable();

    $effect(($) => {
        $.setBall({ ...ballPosWithOffset, xspeed: 0, yspeed: 0 });
    });
    $setInitialPlayerPositions(offensiveTeam, formationBallPos);

    $dispose(() => {
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
        $setBallMoveable();
        $unlockBall();
    });

    $checkpoint({
        to: "EXTRA_POINT_RETRY",
        params: {
            offensiveTeam,
            fieldPos,
            defensiveFouls,
        },
    });

    function chat(player: PlayerObject, message: string) {
        const normalizedMessage = message.trim().toLowerCase();
        const isHikeCommand = normalizedMessage.includes("hike");

        if (!isHikeCommand || player.team !== offensiveTeam) return;

        if ($tick().current < MIN_SNAP_DELAY_TICKS) {
            $effect(($) => {
                $.send({
                    message: t`⚠️ Wait a moment before snapping.`,
                    to: player.id,
                    color: COLOR.CRITICAL,
                });
            });

            return;
        }

        if (isTooFarFromBall(player.position, ballPosWithOffset)) {
            $effect(($) => {
                $.send({
                    message: t`⚠️ You are too far from the ball to snap it.`,
                    to: player.id,
                    color: COLOR.CRITICAL,
                });
            });

            return;
        }

        $effect(($) => {
            $.send({
                message: t`*️⃣ ${player.name} starts the two-point try!`,
                color: COLOR.ACTION,
            });
        });

        $next({
            to: "EXTRA_POINT_SNAP",
            params: {
                offensiveTeam,
                quarterbackId: player.id,
                fieldPos,
                defensiveFouls,
            },
        });
    }

    function buildFrame(): ExtraPointRetryFrame {
        const { self: elapsedTicks } = $tick();

        return { elapsedTicks };
    }

    function $handleAttemptExpired(frame: ExtraPointRetryFrame) {
        if (frame.elapsedTicks < EXTRA_POINT_DECISION_WINDOW) return;

        $setBallInactive();

        $effect(($) => {
            $.send({ message: t`⏱️ PAT window expired.`, color: COLOR.ALERT });
        });

        $next({
            to: "KICKOFF",
            params: {
                forTeam: offensiveTeam,
            },
            wait: ticks({ seconds: 2 }),
        });
    }

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

    function run(_state: GameState) {
        const frame = buildFrame();
        $handleAttemptExpired(frame);
    }

    return { run, chat, command };
}
