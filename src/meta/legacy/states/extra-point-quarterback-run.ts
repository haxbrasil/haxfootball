import type { GameState, GameStatePlayer } from "@runtime/engine";
import { $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import {
    AVATARS,
    findCatchers,
    opposite,
    type FieldPosition,
} from "@common/game/game";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/shared/message";
import { type FieldTeam } from "@runtime/models";
import { isTouchdown, SCORES } from "@meta/legacy/shared/scoring";
import { isInExtraPointZone, isOutOfBounds } from "@meta/legacy/shared/stadium";
import {
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { $global } from "@meta/legacy/hooks/global";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";

type Frame = {
    player: GameStatePlayer;
    defenders: GameStatePlayer[];
};

export function ExtraPointQuarterbackRun({
    playerId,
    ballTeam,
    originalOffensiveTeam,
    fieldPos,
}: {
    playerId: number;
    ballTeam: FieldTeam;
    originalOffensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
}) {
    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();
    $setBallInactive();

    $effect(($) => {
        $.setAvatar(playerId, AVATARS.BALL);
    });

    $dispose(() => {
        $effect(($) => {
            $.setAvatar(playerId, null);
        });

        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
    });

    function buildFrame(state: GameState): Frame | null {
        const player = state.players.find((p) => p.id === playerId);
        if (!player) return null;

        const defenders = state.players.filter(
            (p) => p.team === opposite(ballTeam),
        );

        return { player, defenders };
    }

    function $completeAttempt() {
        $next({
            to: "KICKOFF",
            params: {
                forTeam: originalOffensiveTeam,
            },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $handleTouchdown(frame: Frame) {
        if (
            !isTouchdown({
                player: frame.player,
                offensiveTeam: ballTeam,
            })
        ) {
            return;
        }

        $global((state) => state.incrementScore(ballTeam, SCORES.TWO_POINT));

        const { scores } = $global();

        $effect(($) => {
            if (ballTeam === originalOffensiveTeam) {
                $.send({
                    message: cn("✅", scores, t`two-point try is good!`),
                    color: COLOR.SUCCESS,
                    to: "mixed",
                    sound: "notification",
                    style: "bold",
                });
            } else {
                $.send({
                    message: cn(
                        "🏈",
                        scores,
                        t`defense takes it back`,
                        t`TWO POINTS!`,
                    ),
                    color: COLOR.MOMENTUM,
                    to: "mixed",
                    sound: "notification",
                    style: "bold",
                });
            }
            $.setAvatar(playerId, AVATARS.FIRE);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(playerId, null);
            });
        });

        $next({
            to: "KICKOFF",
            params: {
                forTeam: originalOffensiveTeam,
            },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $handleOutsideExtraPointZone(frame: Frame) {
        if (ballTeam !== originalOffensiveTeam) return;

        if (isInExtraPointZone(frame.player, originalOffensiveTeam)) return;

        $effect(($) => {
            $.send({
                message: t`❌ Two-point try failed.`,
                color: COLOR.WARNING,
            });
            $.setAvatar(playerId, AVATARS.CANCEL);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(playerId, null);
            });
        });

        $completeAttempt();
    }

    function $handleOutOfBounds(frame: Frame) {
        if (!isOutOfBounds(frame.player)) return;

        $effect(($) => {
            $.send({
                message: t`❌ Two-point try failed.`,
                color: COLOR.WARNING,
            });
            $.setAvatar(playerId, AVATARS.CANCEL);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(playerId, null);
            });
        });

        $completeAttempt();
    }

    function $handleTackle(frame: Frame) {
        const catchers = findCatchers(frame.player, frame.defenders);
        if (catchers.length === 0) return;

        $effect(($) => {
            $.send({
                message: t`❌ Two-point try failed.`,
                color: COLOR.WARNING,
            });
            $.setAvatar(playerId, AVATARS.CANCEL);

            catchers.forEach((player) => {
                $.setAvatar(player.id, AVATARS.MUSCLE);
            });
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(playerId, null);

                catchers.forEach((player) => {
                    $.setAvatar(player.id, null);
                });
            });
        });

        $completeAttempt();
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
        if (!frame) return;

        $handleTouchdown(frame);
        $handleOutsideExtraPointZone(frame);
        $handleOutOfBounds(frame);
        $handleTackle(frame);
    }

    return { run, command };
}
