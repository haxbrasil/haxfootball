import type { GameState, GameStatePlayer } from "@runtime/engine";
import { $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { AVATARS, findCatchers } from "@common/game/game";
import { type FieldTeam } from "@runtime/models";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/shared/message";
import { type FieldPosition } from "@common/game/game";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import { findEligibleBallCatchers } from "@meta/legacy/shared/reception";
import {
    calculateDirectionalGain,
    getPositionFromFieldPosition,
    isInExtraPointZone,
    isOutOfBounds,
} from "@meta/legacy/shared/stadium";
import {
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import type { CommandSpec } from "@core/commands";
import { COLOR } from "@common/general/color";

type Frame = {
    state: GameState;
    quarterback: GameStatePlayer;
    defenders: GameStatePlayer[];
    quarterbackCrossedLineOfScrimmage: boolean;
};

export function ExtraPointBlitz({
    offensiveTeam,
    fieldPos,
    quarterbackId,
    ballIsDead = false,
}: {
    offensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
    quarterbackId: number;
    ballIsDead?: boolean;
}) {
    const lineOfScrimmageX = getPositionFromFieldPosition(fieldPos);

    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();

    if (ballIsDead) {
        $setBallInactive();
    } else {
        $setBallActive();
    }

    $effect(($) => {
        $.setAvatar(quarterbackId, AVATARS.BALL);
    });

    $dispose(() => {
        $effect(($) => {
            $.setAvatar(quarterbackId, null);
        });

        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
    });

    function buildFrame(state: GameState): Frame | null {
        const quarterback = state.players.find((p) => p.id === quarterbackId);
        if (!quarterback) return null;

        const defenders = state.players.filter(
            (player) => player.team !== offensiveTeam,
        );

        const quarterbackCrossedLineOfScrimmage =
            calculateDirectionalGain(
                offensiveTeam,
                quarterback.x - lineOfScrimmageX,
            ) > 0;

        return {
            state,
            quarterback,
            defenders,
            quarterbackCrossedLineOfScrimmage,
        };
    }

    function $handleQuarterbackKick(frame: Frame) {
        if (ballIsDead || !frame.quarterback.isKickingBall) return;

        $next({
            to: "EXTRA_POINT_SNAP_IN_FLIGHT",
            params: {
                offensiveTeam,
                fieldPos,
            },
        });
    }

    function $handleOffensiveIllegalTouching(frame: Frame) {
        const offensiveTouchers = findEligibleBallCatchers(
            frame.state.ball,
            frame.state.players.filter(
                (player) =>
                    player.team === offensiveTeam &&
                    player.id !== frame.quarterback.id,
            ),
        );

        if (offensiveTouchers.length === 0) return;

        $effect(($) => {
            $.send({
                message: cn(t`❌ Offensive foul`, t`two-point try failed.`),
                color: COLOR.WARNING,
            });
        });

        $next({
            to: "KICKOFF",
            params: { forTeam: offensiveTeam },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $handleDefensiveTouching(frame: Frame) {
        if (ballIsDead) return;

        const defensiveTouchers = findEligibleBallCatchers(
            frame.state.ball,
            frame.defenders,
        );

        if (defensiveTouchers.length === 0) return;

        $setBallInactive();
        $next({
            to: "EXTRA_POINT_BLITZ",
            params: {
                offensiveTeam,
                fieldPos,
                quarterbackId,
                ballIsDead: true,
            },
        });
    }

    function $handleQuarterbackCrossedLine(frame: Frame) {
        if (!frame.quarterbackCrossedLineOfScrimmage) return;

        $effect(($) => {
            $.send({
                message: t`🏃 QB ${frame.quarterback.name} keeps it and runs!`,
                color: COLOR.ACTION,
            });
        });

        $next({
            to: "EXTRA_POINT_QUARTERBACK_RUN",
            params: {
                playerId: quarterbackId,
                ballTeam: offensiveTeam,
                originalOffensiveTeam: offensiveTeam,
                fieldPos,
            },
        });
    }

    function $handleOutsideExtraPointZone(frame: Frame) {
        if (isInExtraPointZone(frame.quarterback, offensiveTeam)) return;

        $effect(($) => {
            $.send({
                message: t`❌ Two-point try failed.`,
                color: COLOR.WARNING,
            });
            $.setAvatar(quarterbackId, AVATARS.CANCEL);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(quarterbackId, null);
            });
        });

        $next({
            to: "KICKOFF",
            params: { forTeam: offensiveTeam },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $handleQuarterbackOutOfBounds(frame: Frame) {
        if (!isOutOfBounds(frame.quarterback)) return;

        $effect(($) => {
            $.send({
                message: t`❌ Two-point try failed.`,
                color: COLOR.WARNING,
            });
            $.setAvatar(quarterbackId, AVATARS.CANCEL);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(quarterbackId, null);
            });
        });

        $next({
            to: "KICKOFF",
            params: { forTeam: offensiveTeam },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $handleQuarterbackSacked(frame: Frame) {
        const catchers = findCatchers(frame.quarterback, frame.defenders);
        if (catchers.length === 0) return;

        $effect(($) => {
            $.send({
                message: t`❌ Two-point try failed.`,
                color: COLOR.WARNING,
            });
            $.setAvatar(quarterbackId, AVATARS.CANCEL);

            catchers.forEach((player) => {
                $.setAvatar(player.id, AVATARS.MUSCLE);
            });
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(quarterbackId, null);

                catchers.forEach((player) => {
                    $.setAvatar(player.id, null);
                });
            });
        });

        $next({
            to: "KICKOFF",
            params: { forTeam: offensiveTeam },
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

    function run(state: GameState) {
        const frame = buildFrame(state);
        if (!frame) return;

        $handleQuarterbackKick(frame);
        $handleOffensiveIllegalTouching(frame);
        $handleDefensiveTouching(frame);
        $handleQuarterbackCrossedLine(frame);
        $handleOutsideExtraPointZone(frame);
        $handleQuarterbackOutOfBounds(frame);
        $handleQuarterbackSacked(frame);
    }

    return { run, command };
}
