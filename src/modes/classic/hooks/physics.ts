import { $effect } from "@runtime/hooks";
import { Team } from "@runtime/models";
import type { EffectApi } from "@runtime/runtime";
import { getPlaneMask } from "@modes/classic/shared/field";

const PLAYER_MOVEABLE_INV_MASS = 0.5;
const PLAYER_UNMOVEABLE_INV_MASS = 1e26;

const getTeamCollisionGroup = (
    cf: CollisionFlagsObject,
    team: Team,
): number => {
    switch (team) {
        case Team.RED:
            return cf.red;
        case Team.BLUE:
            return cf.blue;
        default:
            return 0;
    }
};

const getPlaneCollisionGroup = (
    cf: CollisionFlagsObject,
    name: Parameters<typeof getPlaneMask>[0],
): number => cf[getPlaneMask(name)];

const setCollisionConfig = ($: EffectApi, playerId: number, cGroup: number) => {
    $.setPlayerDisc(playerId, {
        cGroup,
        cMask: $.CollisionFlags.all,
    });
};

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

export function $trapPlayerInEndZone(playerId: number) {
    $effect(($) => {
        const player = $.getPlayerList().find((p) => p.id === playerId);

        if (!player) return;

        const disc = $.getPlayerDiscProperties(player.id);

        if (!disc) return;

        const cf = $.CollisionFlags;
        const bit = getPlaneCollisionGroup(
            cf,
            player.team === Team.RED ? "redEndZoneTrap" : "blueEndZoneTrap",
        );
        const baseTeamGroup = getTeamCollisionGroup(cf, player.team);

        setCollisionConfig($, player.id, bit | baseTeamGroup);
    });
}

export function $trapTeamInEndZone(team: Team) {
    $effect(($) => {
        const players = $.getPlayerList();
        const cf = $.CollisionFlags;
        const baseTeamGroup = getTeamCollisionGroup(cf, team);

        const target =
            team === Team.RED
                ? players.filter((p) => p.team === Team.RED)
                : players.filter((p) => p.team === Team.BLUE);

        target.forEach((p) => {
            const disc = $.getPlayerDiscProperties(p.id);

            if (!disc) return;

            const bit = getPlaneCollisionGroup(
                cf,
                team === Team.RED ? "redEndZoneTrap" : "blueEndZoneTrap",
            );

            setCollisionConfig($, p.id, bit | baseTeamGroup);
        });
    });
}

export function $untrapAllTeams() {
    $effect(($) => {
        const cf = $.CollisionFlags;
        const mask = cf.all;

        $.getPlayerList()
            .map((p) => ({
                id: p.id,
                base: getTeamCollisionGroup(cf, p.team),
            }))
            .filter((x) => x.base !== 0)
            .forEach(({ id, base }) => {
                $.setPlayerDisc(id, { cGroup: base, cMask: mask });
            });
    });
}

export function $trapPlayerInMidField(playerId: number) {
    $effect(($) => {
        const cf = $.CollisionFlags;
        const player = $.getPlayerList().find((p) => p.id === playerId);

        if (!player) return;

        const disc = $.getPlayerDiscProperties(player.id);

        if (!disc) return;

        const bit = getPlaneCollisionGroup(
            cf,
            player.team === Team.RED ? "midfieldPlaneRed" : "midfieldPlaneBlue",
        );

        const baseTeamGroup = getTeamCollisionGroup(cf, player.team);

        setCollisionConfig($, player.id, bit | baseTeamGroup);
    });
}

export function $trapTeamInMidField(team: Team) {
    $effect(($) => {
        const cf = $.CollisionFlags;
        const bit = getPlaneCollisionGroup(
            cf,
            team === Team.RED ? "midfieldPlaneRed" : "midfieldPlaneBlue",
        );
        const baseTeamGroup = getTeamCollisionGroup(cf, team);

        $.getPlayerList()
            .filter((p) => p.team === team)
            .forEach((p) => {
                const disc = $.getPlayerDiscProperties(p.id);

                if (!disc) return;

                setCollisionConfig($, p.id, bit | baseTeamGroup);
            });
    });
}

export function $lockBall() {
    $effect(($) => {
        const ball = $.getDiscProperties(0);
        if (ball?.invMass === 0.000001) return;

        $.setBall({ invMass: 0.000001 });
    });
}

export function $unlockBall() {
    $effect(($) => {
        const ball = $.getDiscProperties(0);
        if (ball?.invMass === 1) return;

        $.setBall({ invMass: 1 });
    });
}

export function $haltBall() {
    $effect(($) => {
        $.setBall({ xspeed: 0, yspeed: 0 });
    });
}

export function $setBallKickForce(force: "fast" | "strong" | "normal") {
    const invMass = (() => {
        switch (force) {
            case "fast":
                return 1.5;
            case "strong":
                return 1.2;
            case "normal":
            default:
                return 1;
        }
    })();

    $effect(($) => {
        const ball = $.getDiscProperties(0);
        if (ball?.invMass === invMass) return;

        $.setBall({ invMass });
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

export function $setBallMoveableByPlayer(playerId: number) {
    $effect(($) => {
        setPlayerMoveability($, playerId, PLAYER_MOVEABLE_INV_MASS);
    });
}

export function $setBallUnmoveableByPlayer(playerId: number) {
    $effect(($) => {
        setPlayerMoveability($, playerId, PLAYER_UNMOVEABLE_INV_MASS);
    });
}

export function $setBallInMiddleOfField() {
    $effect(($) => {
        $.setBall({ x: 0, y: 0, xspeed: 0, yspeed: 0 });
    });
}
