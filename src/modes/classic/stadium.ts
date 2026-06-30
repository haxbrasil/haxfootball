import { mapNestedRecordValues, repeat } from "@common/general/helpers";
import { mask } from "@common/game/physics";
import { buildStadium } from "@common/stadium-builder";
import type { CollisionFlag } from "@haxball/stadium";
import { SPECIAL_HIDDEN_POSITION } from "@common/stadium-builder/consts";

const COLOR_SCHEMA_RAW = {
    BALL: {
        DEFAULT: "#631515",
    },
    YARD: {
        DEFAULT: "#FFFFFF",
        GOAL: "#FFEA00",
        RED_ZONE: "#BC5345",
        MIDFIELD: "#ACDE97",
    },
    FIELD: {
        HASH: "#D1E1C6",
        TICK: "#FFFFFF",
        TICK_GREEN: "#C7E6BD",
    },
    GOAL_POSTS: {
        SEGMENT: "#FFEA00",
        DISC: "#FFFF00",
    },
    BOUNDARIES: {
        LEFT: "#0000FF",
        RIGHT: "#D0312D",
    },
    LINES: {
        FIRST_DOWN: "#FF9912",
        LINE_OF_SCRIMMAGE: "#3E67CF",
        INTERCEPTION_PATH: "#FFAA00",
        CROWDING_OUTER: "#FF0000",
        CROWDING_INNER: "#F5F5F5",
    },
} as const;

const ADD_DIAGONALS_TO_GOAL_POSTS = false;

export const COLOR_SCHEMA = mapNestedRecordValues(
    COLOR_SCHEMA_RAW,
    (color: string) => color.slice(1, 7),
);

export const BALL_RADIUS = 7.85;
export const BALL_COLOR = COLOR_SCHEMA.BALL.DEFAULT;

export const PLANE_MASK_BY_NAME = {
    redEndZoneTrap: "c0",
    blueEndZoneTrap: "c1",
    midfieldPlaneRed: "c2",
    midfieldPlaneBlue: "c3",
} satisfies Record<string, CollisionFlag>;

export type PlaneMaskName = keyof typeof PLANE_MASK_BY_NAME;

export const { stadium: classicStadium, mapMeasures: classicMapMeasures } =
    buildStadium({
        measures: {
            name: "Classic",
            size: { width: 1090, height: 395 },
            field: { width: 1860, height: 532 },
            endZones: { depth: 155 },
            goal: { width: 120 },
            yard: {
                length: 15.5,
                lines: {
                    intervalYards: 10,
                    redZoneYards: 20,
                },
            },
            hashMarks: {
                bandTopY: -80,
                bandBottomY: 80,
                markHeight: 20,
                subdivisionYards: 2,
            },
            ticks: {
                height: 25,
                offsetYards: 5,
                greenTopYards: [65, 85],
                greenBottomYards: [95],
            },
        },
        colors: {
            yard: {
                default: COLOR_SCHEMA.YARD.DEFAULT,
                goal: COLOR_SCHEMA.YARD.GOAL,
                redZone: COLOR_SCHEMA.YARD.RED_ZONE,
                midfield: COLOR_SCHEMA.YARD.MIDFIELD,
            },
            hash: COLOR_SCHEMA.FIELD.HASH,
            tick: COLOR_SCHEMA.FIELD.TICK,
            tickGreen: COLOR_SCHEMA.FIELD.TICK_GREEN,
        },
        features: {
            collisionSidelines: {
                leftX: -775,
                rightX: 775,
                topY: -375,
                bottomY: 375,
                segment: {
                    vis: false,
                    color: COLOR_SCHEMA.GOAL_POSTS.SEGMENT,
                    bCoef: 0.1,
                    cMask: mask("red", "blue"),
                    cGroup: [],
                },
                vertex: { cMask: [] },
            },
            goalPosts: {
                leftX: -930,
                rightX: 930,
                topY: -60,
                bottomY: 60,
                segment: {
                    color: COLOR_SCHEMA.GOAL_POSTS.SEGMENT,
                    cMask: [],
                },
                vertex: { cMask: [] },
                posts: ADD_DIAGONALS_TO_GOAL_POSTS
                    ? [
                          { from: [-930, -60], to: [-980, -130] },
                          { from: [-930, 60], to: [-990, -10] },
                          { from: [930, -60], to: [980, -130] },
                          { from: [930, 60], to: [990, -10] },
                      ]
                    : [],
                disc: {
                    radius: 4,
                    invMass: 0,
                    color: COLOR_SCHEMA.GOAL_POSTS.DISC,
                },
            },
            ballBoundaries: {
                leftX: -1005,
                rightX: 1005,
                topY: 360,
                bottomY: -360,
                leftSegment: {
                    vis: false,
                    color: COLOR_SCHEMA.BOUNDARIES.LEFT,
                    cMask: mask("ball"),
                },
                rightSegment: {
                    vis: false,
                    color: COLOR_SCHEMA.BOUNDARIES.RIGHT,
                    cMask: mask("ball"),
                },
            },
            planes: [
                {
                    rect: { x: [-1065, 1065], y: [-350, 350] },
                    side: "outside",
                    props: { cMask: ["ball"], bCoef: 1.5 },
                    ref: "ballOutOfBounds",
                },
                {
                    rect: { x: [-1090, 1090], y: [-375, 375] },
                    side: "outside",
                    props: { bCoef: 0.9 },
                    ref: "fieldWall",
                },
                {
                    line: "leftGoalLine",
                    side: "right",
                    props: { cMask: [PLANE_MASK_BY_NAME.redEndZoneTrap] },
                    ref: "redEndZoneTrap",
                },
                {
                    line: "rightGoalLine",
                    side: "left",
                    props: { cMask: [PLANE_MASK_BY_NAME.blueEndZoneTrap] },
                    ref: "blueEndZoneTrap",
                },
                {
                    normal: [-1, 0],
                    dist: 0,
                    cMask: [PLANE_MASK_BY_NAME.midfieldPlaneRed],
                    ref: "midfieldPlaneRed",
                },
                {
                    normal: [1, 0],
                    dist: 0,
                    cMask: [PLANE_MASK_BY_NAME.midfieldPlaneBlue],
                    ref: "midfieldPlaneBlue",
                },
            ],
        },
        schema: {
            canBeStored: false,
            playerPhysics: {
                bCoef: 0.75,
                invMass: 1e26,
                kickStrength: 7,
            },
            cameraFollow: "player",
            ballPhysics: {
                radius: BALL_RADIUS,
                bCoef: 0.25,
                cMask: ["red", "blue", "wall"],
                color: BALL_COLOR,
                cGroup: ["ball", "kick", "score"],
            },
            spawnDistance: 980,
            traits: {},
            redSpawnPoints: [],
            blueSpawnPoints: [],
            points: [],
            planes: [
                {
                    ref: "losBlocker.red",
                    normal: [-1, 0],
                    dist: -SPECIAL_HIDDEN_POSITION[0],
                    cMask: ["redKO"],
                },
                {
                    ref: "losBlocker.blue",
                    normal: [1, 0],
                    dist: -SPECIAL_HIDDEN_POSITION[0],
                    cMask: ["blueKO"],
                },
            ],
            lines: [],
            dynamicLines: [
                {
                    ref: "orange0",
                    joint: { color: COLOR_SCHEMA.LINES.FIRST_DOWN },
                },
                {
                    ref: "blue0",
                    joint: {
                        color: COLOR_SCHEMA.LINES.LINE_OF_SCRIMMAGE,
                    },
                },
                {
                    ref: "ball0",
                    disc: {
                        radius: 7.125,
                        invMass: 0,
                        pos: SPECIAL_HIDDEN_POSITION,
                        color: COLOR_SCHEMA.LINES.INTERCEPTION_PATH,
                        cGroup: [],
                        cMask: [],
                    },
                    joint: { color: COLOR_SCHEMA.LINES.INTERCEPTION_PATH },
                },
                ...repeat(12, (index) => ({
                    ref: `red${index}`,
                    joint: { color: COLOR_SCHEMA.LINES.CROWDING_OUTER },
                })),
                ...repeat(6, (index) => ({
                    ref: `white${index}`,
                    joint: { color: COLOR_SCHEMA.LINES.CROWDING_INNER },
                })),
                ...repeat(2, (index) => ({
                    ref: `tail${index}`,
                    joint: { color: COLOR_SCHEMA.LINES.CROWDING_INNER },
                })),
            ],
            anchors: [
                {
                    ref: "outerCrowdingCorner0",
                    disc: {
                        radius: 1,
                        invMass: 1,
                        pos: SPECIAL_HIDDEN_POSITION,
                        color: COLOR_SCHEMA.LINES.CROWDING_OUTER,
                        cGroup: [],
                    },
                },
                {
                    ref: "outerCrowdingCorner1",
                    disc: {
                        radius: 1,
                        invMass: 1,
                        pos: SPECIAL_HIDDEN_POSITION,
                        color: COLOR_SCHEMA.LINES.CROWDING_OUTER,
                        cGroup: [],
                    },
                },
                {
                    ref: "outerCrowdingCorner2",
                    disc: {
                        radius: 1,
                        invMass: 1,
                        pos: SPECIAL_HIDDEN_POSITION,
                        color: COLOR_SCHEMA.LINES.CROWDING_OUTER,
                        cGroup: [],
                    },
                },
                {
                    ref: "outerCrowdingCorner3",
                    disc: {
                        radius: 1,
                        invMass: 1,
                        pos: SPECIAL_HIDDEN_POSITION,
                        color: COLOR_SCHEMA.LINES.CROWDING_OUTER,
                        cGroup: [],
                    },
                },
                {
                    ref: "innerCrowdingCorner0",
                    disc: {
                        radius: 1,
                        invMass: 1,
                        pos: SPECIAL_HIDDEN_POSITION,
                        color: COLOR_SCHEMA.LINES.CROWDING_INNER,
                        cGroup: [],
                    },
                },
                {
                    ref: "innerCrowdingCorner1",
                    disc: {
                        radius: 1,
                        invMass: 1,
                        pos: SPECIAL_HIDDEN_POSITION,
                        color: COLOR_SCHEMA.LINES.CROWDING_INNER,
                        cGroup: [],
                    },
                },
                {
                    ref: "innerCrowdingCorner2",
                    disc: {
                        radius: 1,
                        invMass: 1,
                        pos: SPECIAL_HIDDEN_POSITION,
                        color: COLOR_SCHEMA.LINES.CROWDING_INNER,
                        cGroup: [],
                    },
                },
                {
                    ref: "innerCrowdingCorner3",
                    disc: {
                        radius: 1,
                        invMass: 1,
                        pos: SPECIAL_HIDDEN_POSITION,
                        color: "transparent",
                        cGroup: [],
                    },
                },
            ],
        },
    });
