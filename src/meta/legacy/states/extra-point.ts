import type { GameState, GameStatePlayer } from "@runtime/engine";
import {
    $before,
    $checkpoint,
    $dispose,
    $effect,
    $next,
    $tick,
} from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { opposite } from "@common/game/game";
import { getDistance } from "@common/math/geometry";
import { type FieldTeam, isFieldTeam } from "@runtime/models";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/shared/message";
import {
    BALL_OFFSET_YARDS,
    ballWithRadius,
    calculateDirectionalGain,
    calculateSnapBallPosition,
    getPositionFromFieldPosition,
} from "@meta/legacy/shared/stadium";
import {
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import {
    $setBallUnmoveable,
    $setBallMoveable,
} from "@meta/legacy/hooks/physics";
import {
    buildInitialPlayerPositions,
    type InitialPositioningRelativeLines,
} from "@meta/legacy/shared/initial-positioning";
import { $global } from "@meta/legacy/hooks/global";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import { SCORES } from "@meta/legacy/shared/scoring";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";
import {
    HIKING_DISTANCE_LIMIT,
    MIN_SNAP_DELAY_TICKS,
} from "@meta/legacy/shared/snap";

const LOADING_DURATION = ticks({ seconds: 0.5 });
const EXTRA_POINT_DECISION_WINDOW = ticks({ seconds: 10 });
const EXTRA_POINT_YARD_LINE = 10;

const DEFAULT_INITIAL_RELATIVE_POSITIONS: InitialPositioningRelativeLines = {
    offensive: {
        start: { x: 100, y: -100 },
        end: { x: 100, y: 100 },
    },
    defensive: {
        start: { x: -100, y: -100 },
        end: { x: -100, y: 100 },
    },
};

function isTooFarFromBall(position: Position | undefined, ballPos: Position) {
    return (
        !position ||
        getDistance(position, ballWithRadius(ballPos)) > HIKING_DISTANCE_LIMIT
    );
}

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
            relativeLines: DEFAULT_INITIAL_RELATIVE_POSITIONS,
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

type Frame = {
    state: GameState;
    previousState: GameState;
    attemptElapsedTicks: number;
    stateElapsedTicks: number;
    kicker: GameStatePlayer | undefined;
    defensiveKicker: GameStatePlayer | undefined;
};

export function ExtraPoint({
    offensiveTeam,
    twoPointLocked = false,
}: {
    offensiveTeam: FieldTeam;
    twoPointLocked?: boolean;
}) {
    const fieldPos = {
        yards: EXTRA_POINT_YARD_LINE,
        side: opposite(offensiveTeam),
    };
    const lineOfScrimmageX = getPositionFromFieldPosition(fieldPos);
    const ballPosWithOffset = calculateSnapBallPosition(
        offensiveTeam,
        fieldPos,
        BALL_OFFSET_YARDS,
    );
    const formationBallPos = calculateSnapBallPosition(offensiveTeam, fieldPos);

    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();
    $setBallActive();
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
    });

    $checkpoint({
        to: "EXTRA_POINT",
        params: {
            offensiveTeam,
            twoPointLocked,
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

        if (twoPointLocked) {
            $effect(($) => {
                $.send({
                    message: cn(
                        t`⚠️ Two-point try is no longer available`,
                        t`kick the PAT.`,
                    ),
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
            },
        });
    }

    function $lockTwoPointAttempt() {
        $next({
            to: "EXTRA_POINT",
            params: {
                offensiveTeam,
                twoPointLocked: true,
            },
        });
    }

    function buildFrame(state: GameState): Frame {
        const previousState = $before();
        const tick = $tick();
        const stateStartTick = tick.now - tick.current;
        const attemptStartTick = tick.now - tick.self;
        const attemptElapsedTicks = state.tickNumber - attemptStartTick;
        const stateElapsedTicks = state.tickNumber - stateStartTick;
        const kicker = state.players.find(
            (player) => player.team === offensiveTeam && player.isKickingBall,
        );
        const defensiveKicker = state.players.find(
            (player) =>
                player.team === opposite(offensiveTeam) && player.isKickingBall,
        );

        return {
            state,
            previousState,
            attemptElapsedTicks,
            stateElapsedTicks,
            kicker,
            defensiveKicker,
        };
    }

    const isBeyondLineOfScrimmage = (player: GameStatePlayer) =>
        calculateDirectionalGain(offensiveTeam, player.x - lineOfScrimmageX) >
        0;

    function $handleAttemptExpired(frame: Frame) {
        if (frame.attemptElapsedTicks < EXTRA_POINT_DECISION_WINDOW) return;

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

    function $handleDefensiveKick(frame: Frame) {
        if (!frame.defensiveKicker) return;

        $setBallInactive();

        $global((state) =>
            state.incrementScore(offensiveTeam, SCORES.TWO_POINT),
        );

        const { scores } = $global();

        $effect(($) => {
            $.send({
                message: cn(
                    "🚫",
                    scores,
                    t`Defensive kick foul`,
                    t`TWO POINTS!`,
                ),
                color: COLOR.WARNING,
                to: "mixed",
                sound: "notification",
                style: "bold",
            });
        });

        $next({
            to: "KICKOFF",
            params: {
                forTeam: offensiveTeam,
            },
            wait: ticks({ seconds: 3 }),
        });
    }

    function $handleKick(frame: Frame) {
        if (!frame.kicker) return;

        $next({
            to: "EXTRA_POINT_KICK",
            params: {
                offensiveTeam,
            },
        });
    }

    function $handleOffenseCrossedLine(frame: Frame) {
        if (twoPointLocked || frame.stateElapsedTicks < LOADING_DURATION) {
            return;
        }

        const offensivePlayersBeyondLine = frame.state.players.filter(
            (player) =>
                player.team === offensiveTeam &&
                isBeyondLineOfScrimmage(player),
        );

        if (offensivePlayersBeyondLine.length === 0) return;

        const offensivePlayersBeyondLineBefore = new Set(
            frame.previousState.players
                .filter(
                    (player) =>
                        player.team === offensiveTeam &&
                        isBeyondLineOfScrimmage(player),
                )
                .map((player) => player.id),
        );

        const hasNewOffensivePlayerBeyondLine = offensivePlayersBeyondLine.some(
            (player) => !offensivePlayersBeyondLineBefore.has(player.id),
        );

        if (!hasNewOffensivePlayerBeyondLine) return;

        $effect(($) => {
            $.send({
                message: cn(
                    t`❌ Offense crossed the LOS`,
                    t`two-point try is no longer available.`,
                ),
                color: COLOR.WARNING,
            });
        });

        $lockTwoPointAttempt();
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

    function run(state: GameState) {
        const frame = buildFrame(state);

        $handleAttemptExpired(frame);
        $handleDefensiveKick(frame);
        $handleKick(frame);
        $handleOffenseCrossedLine(frame);
    }

    return { run, chat, command };
}
