import { type FieldPosition } from "@common/game/game";
import { SPECIAL_HIDDEN_POSITION } from "@common/stadium-builder/consts";
import {
    getLineOfScrimmage,
    LOS_BLOCKER_PLANE_REFS,
} from "@modes/flag/shared/field";
import { $effect } from "@runtime/hooks";
import { Team } from "@runtime/models";

const losPlanePatch = (fieldPos: FieldPosition) => {
    const [line] = getLineOfScrimmage(fieldPos);
    const x = line?.position.x ?? SPECIAL_HIDDEN_POSITION[0];

    return {
        planes: [
            {
                type: "replace",
                ref: LOS_BLOCKER_PLANE_REFS.RED,
                value: {
                    normal: [-1, 0],
                    dist: -x,
                    cMask: ["redKO"],
                },
            },
            {
                type: "replace",
                ref: LOS_BLOCKER_PLANE_REFS.BLUE,
                value: {
                    normal: [1, 0],
                    dist: x,
                    cMask: ["blueKO"],
                },
            },
        ],
    };
};

const teamCollisionGroup = (cf: CollisionFlagsObject, team: TeamID): number => {
    if (team === Team.RED) return cf.red;
    if (team === Team.BLUE) return cf.blue;

    return 0;
};

const teamLineOfScrimmageCollisionGroup = (
    cf: CollisionFlagsObject,
    team: TeamID,
): number => {
    if (team === Team.RED) return cf.redKO;
    if (team === Team.BLUE) return cf.blueKO;

    return 0;
};

export function $requestLineOfScrimmageBlocking(
    fieldPos: FieldPosition,
    operationId: string,
) {
    $effect(($) => {
        $.patchStadium(losPlanePatch(fieldPos), { operationId });
    });

    $setLineOfScrimmageBlockingCollision(false);
}

export function $setLineOfScrimmageBlockingCollision(enabled: boolean) {
    $effect(($) => {
        const cf = $.CollisionFlags;

        $.getPlayerList().forEach((player) => {
            const baseGroup = teamCollisionGroup(cf, player.team);
            if (baseGroup === 0) return;

            const losGroup = teamLineOfScrimmageCollisionGroup(cf, player.team);
            if (losGroup === 0) return;

            const disc = $.getPlayerDiscProperties(player.id);
            const currentGroup =
                typeof disc?.cGroup === "number" ? disc.cGroup : baseGroup;
            const withoutLos = currentGroup & ~cf.redKO & ~cf.blueKO;
            const cGroup = enabled
                ? withoutLos | baseGroup | losGroup
                : withoutLos | baseGroup;

            $.setPlayerDisc(player.id, {
                cGroup,
                cMask: cf.all,
            });
        });
    });
}
