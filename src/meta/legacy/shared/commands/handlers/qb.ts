import { COLOR } from "@common/general/color";
import { type Config } from "@meta/legacy/config";
import { $config, $effect } from "@runtime/runtime";
import { $global } from "@meta/legacy/hooks/global";
import { t } from "@lingui/core/macro";
import {
    formatTargetMatches,
    resolvePlayerTarget,
} from "@meta/legacy/shared/commands/target";
import type { SharedCommandImplementation } from "@meta/legacy/shared/commands/types";

export const qbCommandHandler: SharedCommandImplementation = ({
    player,
    spec,
    options,
}) => {
    const quarterbackOptions = options.qb;

    if (!quarterbackOptions) {
        return { handled: false };
    }

    const config = $config<Config>();

    if (!config.flags.requireQb) {
        $effect(($) => {
            $.send({
                message: t`⚠️ Quarterback selection is disabled.`,
                to: player.id,
                color: COLOR.CRITICAL,
            });
        });

        return { handled: true };
    }

    const rawTarget = spec.args.join(" ").trim();

    if (rawTarget.length === 0) {
        if (player.team !== quarterbackOptions.eligibleTeam) {
            $effect(($) => {
                $.send({
                    message: t`⚠️ Only the eligible team can pick the quarterback right now.`,
                    to: player.id,
                    color: COLOR.CRITICAL,
                });
            });

            return { handled: true };
        }

        const { possessionQuarterback } = $global();

        if (
            possessionQuarterback &&
            possessionQuarterback.team !== quarterbackOptions.eligibleTeam
        ) {
            $global((state) => state.clearPossessionQuarterback());
        }

        const selectedQuarterbackId =
            possessionQuarterback?.team === quarterbackOptions.eligibleTeam
                ? possessionQuarterback.playerId
                : null;

        if (selectedQuarterbackId === player.id) {
            $global((state) => state.clearPossessionQuarterback());

            $effect(($) => {
                $.send({
                    message: t`⚙️ ${player.name} is no longer the quarterback.`,
                    color: COLOR.SYSTEM,
                });

                $.send({
                    message: t`⚠️ Quarterback position is vacant. Use !qb to become the quarterback.`,
                    to: $.getPlayerList().filter(
                        (roomPlayer) =>
                            roomPlayer.team === quarterbackOptions.eligibleTeam,
                    ),
                    color: COLOR.WARNING,
                });
            });

            return { handled: true };
        }

        $global((state) =>
            state.setPossessionQuarterback(
                player.id,
                quarterbackOptions.eligibleTeam,
            ),
        );

        $effect(($) => {
            $.send({
                message: t`⚙️ ${player.name} is now the quarterback.`,
                color: COLOR.SYSTEM,
            });
        });

        return { handled: true };
    }

    if (!player.admin) {
        $effect(($) => {
            $.send({
                message: t`⚠️ Only admins can assign quarterback targets.`,
                to: player.id,
                color: COLOR.CRITICAL,
            });
        });

        return { handled: true };
    }

    $effect(($) => {
        const eligiblePlayers = $.getPlayerList().flatMap((roomPlayer) =>
            roomPlayer.team === quarterbackOptions.eligibleTeam
                ? [
                      {
                          id: roomPlayer.id,
                          name: roomPlayer.name,
                      },
                  ]
                : [],
        );
        const targetResolution = resolvePlayerTarget(eligiblePlayers, rawTarget);

        switch (targetResolution.type) {
            case "INVALID_TARGET":
                $.send({
                    message: t`⚠️ Usage: !qb [#id|name].`,
                    to: player.id,
                    color: COLOR.CRITICAL,
                });
                return;
            case "NOT_FOUND":
                $.send({
                    message: t`⚠️ No eligible player matched that quarterback target.`,
                    to: player.id,
                    color: COLOR.CRITICAL,
                });
                return;
            case "AMBIGUOUS": {
                const ambiguousNames = formatTargetMatches(
                    targetResolution.matches,
                );

                $.send({
                    message: t`⚠️ Multiple players matched: ${ambiguousNames}. Use !qb #id.`,
                    to: player.id,
                    color: COLOR.CRITICAL,
                });
                return;
            }
            case "OK":
                $global((state) =>
                    state.setPossessionQuarterback(
                        targetResolution.player.id,
                        quarterbackOptions.eligibleTeam,
                    ),
                );

                $.send({
                    message: t`⚙️ ${player.name} set ${targetResolution.player.name} as quarterback.`,
                    color: COLOR.SYSTEM,
                });
                return;
        }
    });

    return { handled: true };
};
