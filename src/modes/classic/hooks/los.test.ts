import { beforeEach, describe, expect, it, vi } from "vitest";
import { Team } from "@runtime/models";
import type { EffectApi } from "@runtime/runtime";

const runtime = vi.hoisted(() => ({
    effects: [] as Array<(api: EffectApi) => void>,
}));

vi.mock("@runtime/hooks", () => ({
    $effect: (effect: (api: EffectApi) => void) => {
        runtime.effects.push(effect);
    },
}));

import { $setLineOfScrimmageBlockingCollision } from "./los";

const collisionFlags = {
    all: 0xffff,
    red: 1,
    blue: 2,
    redKO: 4,
    blueKO: 8,
    c2: 16,
} as CollisionFlagsObject;

const redPlayer = {
    id: 7,
    team: Team.RED,
} as PlayerObject;

const runCollisionEffect = ({
    currentGroup,
    enabled,
}: {
    currentGroup: number;
    enabled: boolean;
}) => {
    const setPlayerDisc = vi.fn();

    $setLineOfScrimmageBlockingCollision(enabled);

    const effect = runtime.effects.shift();
    expect(effect).toBeDefined();

    effect?.({
        CollisionFlags: collisionFlags,
        getPlayerList: () => [redPlayer],
        getPlayerDiscProperties: () => ({ cGroup: currentGroup }),
        setPlayerDisc,
    } as unknown as EffectApi);

    return setPlayerDisc;
};

describe("$setLineOfScrimmageBlockingCollision", () => {
    beforeEach(() => {
        runtime.effects.length = 0;
    });

    it("clears stale kickoff barrier groups when disabled", () => {
        const setPlayerDisc = runCollisionEffect({
            currentGroup: collisionFlags.red | collisionFlags.c2,
            enabled: false,
        });

        expect(setPlayerDisc).toHaveBeenCalledWith(redPlayer.id, {
            cGroup: collisionFlags.red,
            cMask: collisionFlags.all,
        });
    });

    it("preserves unrelated groups when enabling LOS blocking", () => {
        const setPlayerDisc = runCollisionEffect({
            currentGroup: collisionFlags.red | collisionFlags.c2,
            enabled: true,
        });

        expect(setPlayerDisc).toHaveBeenCalledWith(redPlayer.id, {
            cGroup:
                collisionFlags.red | collisionFlags.c2 | collisionFlags.redKO,
            cMask: collisionFlags.all,
        });
    });
});
