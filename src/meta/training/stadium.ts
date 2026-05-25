import { mask } from "@common/game/physics";
import { defineStadium } from "@common/stadium-generator";
import {
    BALL_COLOR,
    BALL_RADIUS,
    legacyMapMeasures,
} from "@meta/legacy/stadium";
import {
    TRAINING_LANES,
    TRAINING_TARGET_COUNT,
    TRAINING_TARGET_RADIUS,
} from "./shared/geometry";

const TRAINING_BALL_START_DISC_ID = 1;
const TRAINING_TARGET_START_DISC_ID =
    TRAINING_BALL_START_DISC_ID + TRAINING_LANES.length;

export const TRAINING_TRACKED_DISC = {
    LANE_BALL_0: "laneBall0",
    LANE_BALL_1: "laneBall1",
    LANE_BALL_2: "laneBall2",
} as const;

export const TRAINING_BALL_DISC_ID = {
    LANE_0: TRAINING_BALL_START_DISC_ID,
    LANE_1: TRAINING_BALL_START_DISC_ID + 1,
    LANE_2: TRAINING_BALL_START_DISC_ID + 2,
} as const;

export const TRAINING_BALL_DISC_IDS = [
    TRAINING_BALL_DISC_ID.LANE_0,
    TRAINING_BALL_DISC_ID.LANE_1,
    TRAINING_BALL_DISC_ID.LANE_2,
] as const;

export const TRAINING_LANE_BALL_DISC_NAMES = [
    TRAINING_TRACKED_DISC.LANE_BALL_0,
    TRAINING_TRACKED_DISC.LANE_BALL_1,
    TRAINING_TRACKED_DISC.LANE_BALL_2,
] as const;

export const TRAINING_TARGET_DISC_IDS = TRAINING_LANES.map((_, laneIndex) =>
    Array.from(
        { length: TRAINING_TARGET_COUNT },
        (_target, targetIndex) =>
            TRAINING_TARGET_START_DISC_ID +
            laneIndex * TRAINING_TARGET_COUNT +
            targetIndex,
    ),
);

export const TRAINING_TARGET_DISC_NAMES = TRAINING_TARGET_DISC_IDS.map(
    (targetIds, laneIndex) =>
        targetIds.map(
            (_targetId, targetIndex) =>
                `target${laneIndex}_${targetIndex}` as const,
        ),
);

export const TRAINING_TRACKED_DISCS = {
    [TRAINING_TRACKED_DISC.LANE_BALL_0]: TRAINING_BALL_DISC_ID.LANE_0,
    [TRAINING_TRACKED_DISC.LANE_BALL_1]: TRAINING_BALL_DISC_ID.LANE_1,
    [TRAINING_TRACKED_DISC.LANE_BALL_2]: TRAINING_BALL_DISC_ID.LANE_2,
    ...Object.fromEntries(
        TRAINING_TARGET_DISC_NAMES.flatMap((targetNames, laneIndex) =>
            targetNames.map((targetName, targetIndex) => [
                targetName,
                TRAINING_TARGET_DISC_IDS[laneIndex]![targetIndex]!,
            ]),
        ),
    ),
} as const;

export const TRAINING_TARGET_GROUP = "c0";
export const TRAINING_RED_TARGET_COLOR = 0xd0312d;
export const TRAINING_BLUE_TARGET_COLOR = 0x3e67cf;
export const TRAINING_BALL_COLOR = 0x631515;
export const TRAINING_BALL_INV_MASS = 1;
export const TRAINING_READY_BALL_BCOEF = 0.25;
export const TRAINING_BALL_DAMPING = 0.99;
export const TRAINING_PLAYER_MOVEABLE_INV_MASS = 0.5;
export const TRAINING_TARGET_INV_MASS = 1;
export const TRAINING_TARGET_BCOEF = Number.MAX_VALUE;
export const TRAINING_TARGET_DAMPING = 1;
export const TRAINING_HIDDEN_DISC = {
    radius: 0,
    cMask: 0,
    cGroup: 0,
    color: -1,
    xspeed: 0,
    yspeed: 0,
};

const transparentDisc = {
    radius: 0,
    invMass: 0,
    pos: [0, 0] as [number, number],
    color: "transparent" as const,
    cGroup: [],
    cMask: [],
};

export const { stadium: trainingStadium, index: trainingStadiumIndex } =
    defineStadium({
        name: "Training",
        width: 1090,
        height: 395,
        bg: {
            type: "none",
            width:
                legacyMapMeasures.OUTER_FIELD.bottomRight.x -
                legacyMapMeasures.OUTER_FIELD.topLeft.x,
            height:
                legacyMapMeasures.OUTER_FIELD.bottomRight.y -
                legacyMapMeasures.OUTER_FIELD.topLeft.y,
            color: "718C5A",
        },
        cameraFollow: "player",
        canBeStored: false,
        kickOffReset: "partial",
        ballPhysics: "disc0",
        playerPhysics: {
            bCoef: 0.75,
            invMass: TRAINING_PLAYER_MOVEABLE_INV_MASS,
            kickStrength: 7,
        },
        discs: [
            transparentDisc,
            ...TRAINING_LANES.map((lane) => ({
                radius: BALL_RADIUS,
                bCoef: TRAINING_READY_BALL_BCOEF,
                invMass: TRAINING_BALL_INV_MASS,
                damping: TRAINING_BALL_DAMPING,
                pos: [lane.ball.x, lane.ball.y] as [number, number],
                color: BALL_COLOR,
                cGroup: mask("ball", "kick"),
                cMask: mask("red", "blue", TRAINING_TARGET_GROUP),
            })),
            ...TRAINING_TARGET_DISC_IDS.flatMap((targetIds) =>
                targetIds.map(() => ({
                    radius: TRAINING_TARGET_RADIUS,
                    invMass: TRAINING_TARGET_INV_MASS,
                    bCoef: TRAINING_TARGET_BCOEF,
                    damping: TRAINING_TARGET_DAMPING,
                    pos: [2000, 2000] as [number, number],
                    color: "transparent" as const,
                    cGroup: mask(TRAINING_TARGET_GROUP),
                    cMask: mask("ball"),
                })),
            ),
        ],
        rects: TRAINING_LANES.map((lane) => ({
            name: `trainingLane${lane.id}`,
            x: [lane.bounds.left, lane.bounds.right] as [number, number],
            y: [lane.bounds.top, lane.bounds.bottom] as [number, number],
            vertex: { cMask: [] },
            segment: {
                color: "FFFFFF",
                vis: true,
                bCoef: 0.1,
                cGroup: mask("wall"),
                cMask: mask("red", "blue"),
            },
        })),
        planes: [
            {
                rect: {
                    x: [
                        legacyMapMeasures.OUTER_FIELD.topLeft.x,
                        legacyMapMeasures.OUTER_FIELD.bottomRight.x,
                    ],
                    y: [
                        legacyMapMeasures.OUTER_FIELD.topLeft.y,
                        legacyMapMeasures.OUTER_FIELD.bottomRight.y,
                    ],
                },
                side: "outside",
                props: { bCoef: 0.9 },
                name: "fieldWall",
            },
        ],
        redSpawnPoints: [],
        blueSpawnPoints: [],
        goals: [],
    });
