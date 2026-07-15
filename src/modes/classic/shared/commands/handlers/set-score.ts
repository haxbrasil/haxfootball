import { COLOR } from "@common/general/color";
import { t } from "@lingui/core/macro";
import { $global } from "@modes/classic/hooks/global";
import { cn } from "@modes/classic/shared/presentation/message";
import type { SharedCommandImplementation } from "@modes/classic/shared/commands/types";
import { $effect } from "@runtime/runtime";
import { Team } from "@runtime/models";

const MAX_SCORE = 255;

const parseScore = (value: string | undefined): number | null => {
    if (!value) return null;

    const score = Number(value);

    return Number.isInteger(score) && score >= 0 && score <= MAX_SCORE
        ? score
        : null;
};

export const parseSetScoreArgs = (
    args: string[],
): { red: number; blue: number } | null => {
    if (args.length !== 2) return null;

    const red = parseScore(args[0]);
    const blue = parseScore(args[1]);

    return red === null || blue === null ? null : { red, blue };
};

export const setScoreCommandHandler: SharedCommandImplementation = ({
    player,
    spec,
}) => {
    if (!player.admin) {
        $effect(($) => {
            $.send({
                message: t`⚠️ Only admins can change the score.`,
                color: COLOR.CRITICAL,
                to: player.id,
            });
        });

        return { handled: true };
    }

    const score = parseSetScoreArgs(spec.args);

    if (!score) {
        $effect(($) => {
            $.send({
                message: t`⚠️ Usage: !setscore <red> <blue> (0-255).`,
                color: COLOR.CRITICAL,
                to: player.id,
            });
        });

        return { handled: true };
    }

    $global((state) => state.setScore(score.red, score.blue));

    $effect(($) => {
        $.send({
            message: cn(
                "⚙️",
                {
                    [Team.RED]: score.red,
                    [Team.BLUE]: score.blue,
                },
                t`${player.name} set the score.`,
            ),
            color: COLOR.SYSTEM,
        });
    });

    return { handled: true };
};
