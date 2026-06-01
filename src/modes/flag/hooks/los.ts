import { $effect } from "@runtime/runtime";
import { Team } from "@runtime/models";
import {
    getLineOfScrimmage,
    getLineOfScrimmageBlockers,
} from "@modes/flag/shared/field";
import { SPECIAL_HIDDEN_DISC_POSITION } from "@common/stadium-builder/consts";
import { computeBlockingPlan } from "@modes/flag/shared/interaction/los-blocking";

const LOS_BLOCKING_VERTICAL_EXTENSION = 2000;
const LOS_BLOCKING_SLOT_RADIUS = 4;

export function $syncLineOfScrimmageBlocking({
    enabled = true,
}: {
    enabled?: boolean;
} = {}) {
    $effect(($) => {
        const line = getLineOfScrimmage();
        if (line.length < 2 || !line[0] || !line[1]) return;

        const topDisc = $.getDiscProperties(line[0].id);
        const bottomDisc = $.getDiscProperties(line[1].id);

        if (!topDisc || !bottomDisc) return;
        if (typeof topDisc.x !== "number" || typeof topDisc.y !== "number") {
            return;
        }
        if (
            typeof bottomDisc.x !== "number" ||
            typeof bottomDisc.y !== "number"
        ) {
            return;
        }

        const lineIsHidden =
            (topDisc.x === SPECIAL_HIDDEN_DISC_POSITION.x &&
                topDisc.y === SPECIAL_HIDDEN_DISC_POSITION.y) ||
            (bottomDisc.x === SPECIAL_HIDDEN_DISC_POSITION.x &&
                bottomDisc.y === SPECIAL_HIDDEN_DISC_POSITION.y);

        const blockerIds = getLineOfScrimmageBlockers().map(({ id }) => id);

        if (!enabled || lineIsHidden) {
            blockerIds.forEach((blockerId) => {
                $.setDiscProperties(blockerId, SPECIAL_HIDDEN_DISC_POSITION);
            });

            return;
        }

        const blockers = blockerIds
            .map((id) => {
                const disc = $.getDiscProperties(id);
                if (!disc) return null;
                if (typeof disc.x !== "number" || typeof disc.y !== "number") {
                    return null;
                }

                return {
                    id,
                    position: { x: disc.x, y: disc.y },
                };
            })
            .filter((blocker) => blocker !== null);

        const players = $.getPlayerList()
            .filter(
                (player) =>
                    player.team === Team.RED || player.team === Team.BLUE,
            )
            .map((player) => {
                const disc = $.getPlayerDiscProperties(player.id);
                if (!disc) return null;
                if (typeof disc.x !== "number" || typeof disc.y !== "number") {
                    return null;
                }

                return {
                    id: player.id,
                    position: { x: disc.x, y: disc.y },
                };
            })
            .filter((player) => player !== null);

        const plan = computeBlockingPlan({
            line: {
                a: {
                    x: topDisc.x,
                    y: topDisc.y - LOS_BLOCKING_VERTICAL_EXTENSION,
                },
                b: {
                    x: bottomDisc.x,
                    y: bottomDisc.y + LOS_BLOCKING_VERTICAL_EXTENSION,
                },
            },
            players,
            blockers,
            blockerRadius: LOS_BLOCKING_SLOT_RADIUS,
        });

        plan.moves.forEach((move) => {
            $.setDiscProperties(move.blockerId, move.target);
        });
    });
}
