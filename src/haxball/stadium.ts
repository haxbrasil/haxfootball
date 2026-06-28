/**
 * @file Stadium type definitions for HaxBall custom stadiums
 *
 * This module provides TypeScript type definitions for creating valid custom stadiums
 * based on the HaxBall stadium file (.hbs) format specification.
 *
 * @see {@link https://github.com/haxball/haxball-issues/wiki/Headless-Host#stadium-file-hbs}
 *
 * @example
 * ```typescript
 * import { StadiumObject } from '@types/stadium';
 * import JSON5 from 'json5';
 *
 * const myStadium: StadiumObject = {
 *   name: "My Custom Stadium",
 *   width: 600,
 *   height: 270,
 *   bg: {
 *     type: "grass",
 *     width: 550,
 *     height: 240
 *   },
 *   vertexes: [
 *     { x: -550, y: -240 },
 *     { x: 550, y: -240 },
 *     // ... more vertices
 *   ],
 *   segments: [
 *     { v0: 0, v1: 1, vis: true, color: "FFFFFF" },
 *     // ... more segments
 *   ],
 *   goals: [
 *     { p0: [-550, -80], p1: [-550, 80], team: "red" },
 *     { p0: [550, -80], p1: [550, 80], team: "blue" }
 *   ]
 * };
 *
 * // Convert to JSON5 string and use with the API
 * const stadiumString = JSON5.stringify(myStadium);
 * room.setStadium(stadiumString);
 * ```
 */

import { Pair } from "@common/general/types";

/**
 * Color type for stadium objects.
 * Can be "transparent", a hex string "RRGGBB", or an RGB array [R, G, B].
 */
export type Color = "transparent" | string | [number, number, number];

export type CollisionFlag =
    | "ball"
    | "red"
    | "blue"
    | "redKO"
    | "blueKO"
    | "wall"
    | "all"
    | "kick"
    | "score"
    | "c0"
    | "c1"
    | "c2"
    | "c3";

/**
 * Vertex - a point which can collide with discs but cannot move and is not visible.
 */
export interface Vertex {
    /** Stable server-side reference for haxball-rs stadium patches */
    ref?: string;
    /** The x position for the vertex */
    x: number;
    /** The y position for the vertex */
    y: number;
    /** The bouncing coefficient */
    bCoef?: number;
    /** A list of flags that represent this object's collision mask */
    cMask?: CollisionFlag[];
    /** A list of flags that represent this object's collision group */
    cGroup?: CollisionFlag[];
    /** A trait to use as default values for this object */
    trait?: string;
}

/**
 * Segment - a line (curved or straight) that connects two vertexes.
 */
export interface Segment {
    /** Stable server-side reference for haxball-rs stadium patches */
    ref?: string;
    /** Index of a vertex in the stadium vertex list to be used as first point of the segment */
    v0: number;
    /** Index of a vertex in the stadium vertex list to be used as the second point of the segment */
    v1: number;
    /** The bouncing coefficient */
    bCoef?: number;
    /** The angle in degrees with which the segment will curve forming an arc between its two vertexes */
    curve?: number;
    /** Alternative representation of the segment's curve. If this value is present the curve value will be ignored */
    curveF?: number;
    /** Determines the thickness and one-way collision behavior of the segment */
    bias?: number;
    /** A list of flags that represent this object's collision mask */
    cMask?: CollisionFlag[];
    /** A list of flags that represent this object's collision group */
    cGroup?: CollisionFlag[];
    /** If set to false the segment will be invisible */
    vis?: boolean;
    /** The color with which the segment will be drawn */
    color?: Color;
    /** A trait to use as default values for this object */
    trait?: string;
}

/**
 * Goal - lines belonging to a team, when the ball crosses this line the opposite team scores.
 */
export interface Goal {
    /** Stable server-side reference for haxball-rs stadium patches */
    ref?: string;
    /** The coordinates of the first point of the line in an array form [x, y] */
    p0: Pair<number>;
    /** The coordinates of the second point of the line in an array form [x, y] */
    p1: Pair<number>;
    /** The team the goal belongs to */
    team: "red" | "blue";
    /** A trait to use as default values for this object */
    trait?: string;
}

/**
 * Plane - collision objects that divide the map in two by an infinite line.
 */
export interface Plane {
    /** Stable server-side reference for haxball-rs stadium patches */
    ref?: string;
    /** The direction vector of the plane in an array form [x, y] */
    normal: Pair<number>;
    /** The distance from coordinates [0,0] (in direction of the normal) in which the plane is located at */
    dist: number;
    /** The bouncing coefficient */
    bCoef?: number;
    /** A list of flags that represent this object's collision mask */
    cMask?: CollisionFlag[];
    /** A list of flags that represent this object's collision group */
    cGroup?: CollisionFlag[];
    /** A trait to use as default values for this object */
    trait?: string;
}

/**
 * Disc - circular physical objects that are placed in the stadium.
 */
export interface Disc {
    /** Stable server-side reference for haxball-rs stadium patches */
    ref?: string;
    /** The starting position of the object in array form [x, y] */
    pos?: Pair<number>;
    /** The starting speed of the object in array form [x, y] */
    speed?: Pair<number>;
    /** The gravity vector of the object in array form [x, y] */
    gravity?: Pair<number>;
    /** The radius of the disc */
    radius?: number;
    /** The inverse of the disc's mass */
    invMass?: number;
    /** The damping factor of the disc */
    damping?: number;
    /** The disc fill color. Supports "transparent" color */
    color?: Color;
    /** The bouncing coefficient */
    bCoef?: number;
    /** A list of flags that represent this object's collision mask */
    cMask?: CollisionFlag[];
    /** A list of flags that represent this object's collision group */
    cGroup?: CollisionFlag[];
    /** A trait to use as default values for this object */
    trait?: string;
}

/**
 * PlayerPhysics - describes physical constants affecting the players.
 */
export interface PlayerPhysics {
    /** Gravity vector */
    gravity?: Pair<number>;
    /** Radius of the player disc */
    radius?: number;
    /** Inverse of the player's mass */
    invMass?: number;
    /** Bouncing coefficient */
    bCoef?: number;
    /** Damping factor */
    damping?: number;
    /** Collision group */
    cGroup?: CollisionFlag[];
    /** How fast a player accelerates when moving around with keys */
    acceleration?: number;
    /** Replaces acceleration when the player is holding the kick button */
    kickingAcceleration?: number;
    /** Replaces damping when the player is holding the kick button */
    kickingDamping?: number;
    /** How much force the player applies to the ball when kicking */
    kickStrength?: number;
    /** Force applied to the kicking player instead */
    kickback?: number;
}

/**
 * Joint - physical connections between two Discs.
 */
export interface Joint {
    /** Stable server-side reference for haxball-rs stadium patches */
    ref?: string;
    /** Index of one of the two discs connected by the joint */
    d0: number;
    /** Index of one of the two discs connected by the joint */
    d1: number;
    /** Joint length - can be null (auto), a number, or [min, max] range */
    length?: number | Pair<number> | null;
    /** Joint strength - can be "rigid" or a float value for spring-like behavior */
    strength?: "rigid" | number;
    /** The color of the joint. Supports "transparent" color */
    color?: Color;
    /** A trait to use as default values for this object */
    trait?: string;
}

/**
 * BackgroundObject - describes the background for the stadium.
 */
export interface BackgroundObject {
    /** The type of background to use for the stadium */
    type?: "grass" | "hockey" | "none";
    /** Width of the background rectangle */
    width?: number;
    /** Height of the background rectangle */
    height?: number;
    /** Radius of the kickoff circle */
    kickOffRadius?: number;
    /** Radius of the corners of the circle (creates rounded corners if > 0) */
    cornerRadius?: number;
    /** Horizontal distance to the goals from position <0,0>, used by "hockey" background only */
    goalLine?: number;
    /** Background color for the stadium */
    color?: Color;
}

/**
 * TraitValues - an object that will define the default values of any object that references that trait.
 */
export type TraitValues = Partial<
    Vertex & Segment & Goal & Plane & Disc & PlayerPhysics & Joint
>;

/**
 * StadiumObject - the root object of a stadium file (.hbs).
 */
export interface StadiumObject {
    /** The name of the stadium */
    name: string;
    /** The width of a rectangle centered in coordinates <0,0> in which the camera will be contained */
    width: number;
    /** The height of a rectangle centered in coordinates <0,0> in which the camera will be contained */
    height: number;
    /** The maximum allowed viewable width for the level. Setting to 0 disables this feature */
    maxViewWidth?: number;
    /** Changes the camera following behaviour */
    cameraFollow?: "player" | "ball";
    /** The distance from <0,0> at which the teams will spawn during kickoff */
    spawnDistance?: number;
    /** This value defines whether this stadium can be stored with the /store command */
    canBeStored?: boolean;
    /** Can be set to either "full" or "partial" */
    kickOffReset?: "full" | "partial";
    /** An object describing the background for the stadium */
    bg?: BackgroundObject;
    /** A map of named traits */
    traits?: Record<string, TraitValues>;
    /** List of vertexes */
    vertexes?: Vertex[];
    /** List of segments */
    segments?: Segment[];
    /** List of goals */
    goals?: Goal[];
    /** List of discs */
    discs?: Disc[];
    /** List of planes */
    planes?: Plane[];
    /** List of joints */
    joints?: Joint[];
    /** List of spawn points used for the red team kickoff */
    redSpawnPoints?: Pair<number>[];
    /** List of spawn points used for the blue team kickoff */
    blueSpawnPoints?: Pair<number>[];
    /** Object describing the player physics */
    playerPhysics?: PlayerPhysics;
    /** The Disc used to create the ball. Can be "disc0" to use the first disc as the ball */
    ballPhysics?: Disc | "disc0";
}
