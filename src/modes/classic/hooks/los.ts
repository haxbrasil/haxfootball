import { $effect } from "@runtime/runtime";
import {
    getLineOfScrimmage,
    LOS_BLOCKER_REFS,
} from "@modes/classic/shared/field";
import { SPECIAL_HIDDEN_DISC_POSITION } from "@common/stadium-builder/consts";

const LOS_BLOCKING_VERTICAL_EXTENSION = 2000;
let patchedLineKey: string | null = null;

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

        if (!topDisc || !bottomDisc) {
            patchedLineKey = null;
            return;
        }
        if (typeof topDisc.x !== "number" || typeof topDisc.y !== "number") {
            patchedLineKey = null;
            return;
        }
        if (
            typeof bottomDisc.x !== "number" ||
            typeof bottomDisc.y !== "number"
        ) {
            patchedLineKey = null;
            return;
        }

        const lineIsHidden =
            (topDisc.x === SPECIAL_HIDDEN_DISC_POSITION.x &&
                topDisc.y === SPECIAL_HIDDEN_DISC_POSITION.y) ||
            (bottomDisc.x === SPECIAL_HIDDEN_DISC_POSITION.x &&
                bottomDisc.y === SPECIAL_HIDDEN_DISC_POSITION.y);
        const shouldShow = enabled && !lineIsHidden;
        const visibleLineKey = `${topDisc.x}:${topDisc.y}:${bottomDisc.x}:${bottomDisc.y}`;
        const nextLineKey = shouldShow ? visibleLineKey : "hidden";

        if (patchedLineKey === nextLineKey) return;

        const hiddenVertex = {
            x: SPECIAL_HIDDEN_DISC_POSITION.x,
            y: SPECIAL_HIDDEN_DISC_POSITION.y,
        };
        const visibleVertexes = [
            {
                type: "replace",
                ref: LOS_BLOCKER_REFS.A,
                value: {
                    x: topDisc.x,
                    y: topDisc.y - LOS_BLOCKING_VERTICAL_EXTENSION,
                },
            },
            {
                type: "replace",
                ref: LOS_BLOCKER_REFS.B,
                value: {
                    x: bottomDisc.x,
                    y: bottomDisc.y + LOS_BLOCKING_VERTICAL_EXTENSION,
                },
            },
        ];
        const hiddenVertexes = [
            {
                type: "replace",
                ref: LOS_BLOCKER_REFS.A,
                value: hiddenVertex,
            },
            {
                type: "replace",
                ref: LOS_BLOCKER_REFS.B,
                value: hiddenVertex,
            },
        ];

        if (shouldShow) {
            $.patchStadium({ vertexes: visibleVertexes });
            patchedLineKey = nextLineKey;
            return;
        }

        $.patchStadium({ vertexes: hiddenVertexes });
        patchedLineKey = nextLineKey;
    });
}
