import { $effect } from "@runtime/runtime";
import { Line } from "@common/math/geometry";
import { FieldPosition } from "@common/game/game";
import { Team, type FieldTeam } from "@runtime/models";
import {
    arrangeCrowdingBoxes,
    getLineOfScrimmage,
    getFirstDownLine,
    getInterceptionPath,
    hideCrowdingBoxes,
    BALL_DISC_ID,
    BALL_ACTIVE_COLOR,
    BALL_INACTIVE_COLOR,
    isInMainField,
} from "@modes/classic/shared/stadium";
import { SPECIAL_HIDDEN_DISC_POSITION } from "@common/stadium-builder/consts";

export function $setLineOfScrimmage(fieldPos: FieldPosition) {
    $effect(($) => {
        const lineOfScrimmage = getLineOfScrimmage(fieldPos);

        lineOfScrimmage.forEach(({ id, position }) => {
            $.setDiscProperties(id, {
                x: position.x,
                y: position.y,
            });
        });
    });
}

export function $unsetLineOfScrimmage() {
    $effect(($) => {
        const lineOfScrimmage = getLineOfScrimmage();

        lineOfScrimmage.forEach(({ id }) => {
            $.setDiscProperties(id, SPECIAL_HIDDEN_DISC_POSITION);
        });
    });
}

export function $setFirstDownLine(
    offensiveTeam: Team,
    fieldPos: FieldPosition,
    distance: number,
) {
    $effect(($) => {
        const firstDownLine = getFirstDownLine(
            offensiveTeam,
            fieldPos,
            distance,
        );

        const shouldHide =
            firstDownLine.length === 0 ||
            !firstDownLine[0] ||
            !isInMainField(firstDownLine[0].position);

        if (shouldHide) {
            getFirstDownLine().forEach(({ id }) => {
                $.setDiscProperties(id, SPECIAL_HIDDEN_DISC_POSITION);
            });

            return;
        }

        firstDownLine.forEach(({ id, position }) => {
            $.setDiscProperties(id, {
                x: position.x,
                y: position.y,
            });
        });
    });
}

export function $unsetFirstDownLine() {
    $effect(($) => {
        const firstDownLine = getFirstDownLine();

        firstDownLine.forEach(({ id }) => {
            $.setDiscProperties(id, SPECIAL_HIDDEN_DISC_POSITION);
        });
    });
}

export function $showInterceptionPath(line: Line) {
    $effect(($) => {
        getInterceptionPath(line).forEach(({ id, position }) => {
            $.setDiscProperties(id, {
                x: position.x,
                y: position.y,
            });
        });
    });
}

export function $hideInterceptionPath() {
    $effect(($) => {
        getInterceptionPath().forEach(({ id }) => {
            $.setDiscProperties(id, SPECIAL_HIDDEN_DISC_POSITION);
        });
    });
}

export function $showCrowdingBoxes(
    offensiveTeam: FieldTeam,
    fieldPos: FieldPosition,
) {
    $effect(($) => {
        arrangeCrowdingBoxes(offensiveTeam, fieldPos).forEach(([id, x, y]) => {
            $.setDiscProperties(id, { x, y });
        });
    });
}

export function $hideCrowdingBoxes() {
    $effect(($) => {
        hideCrowdingBoxes().forEach(([id, x, y]) => {
            $.setDiscProperties(id, { x, y });
        });
    });
}

export function $setBallInactive() {
    $effect(($) => {
        $.setDiscProperties(BALL_DISC_ID, {
            color: BALL_INACTIVE_COLOR,
        });
    });
}

export function $setBallActive() {
    $effect(($) => {
        $.setDiscProperties(BALL_DISC_ID, {
            color: BALL_ACTIVE_COLOR,
        });
    });
}
