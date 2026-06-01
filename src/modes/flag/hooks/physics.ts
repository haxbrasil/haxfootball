import { $effect } from "@runtime/hooks";
import type { EffectApi } from "@runtime/runtime";

const PLAYER_MOVEABLE_INV_MASS = 0.5;
const PLAYER_UNMOVEABLE_INV_MASS = 1e26;

const setPlayerMoveability = (
    $: EffectApi,
    playerId: number,
    invMass: number,
) => {
    $.setPlayerDisc(playerId, {
        invMass,
        cMask: $.CollisionFlags.all,
    });
};

export function $lockBall() {
    $effect(($) => {
        $.setBall({ invMass: 0.000001 });
    });
}

export function $unlockBall() {
    $effect(($) => {
        $.setBall({ invMass: 1 });
    });
}

export function $setBallMoveable() {
    $effect(($) => {
        $.getPlayerList().forEach((p) => {
            setPlayerMoveability($, p.id, PLAYER_MOVEABLE_INV_MASS);
        });
    });
}

export function $setBallUnmoveable() {
    $effect(($) => {
        $.getPlayerList().forEach((p) => {
            setPlayerMoveability($, p.id, PLAYER_UNMOVEABLE_INV_MASS);
        });
    });
}
