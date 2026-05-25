import { Training } from "./states/training";
import { TRAINING_TRACKED_DISCS } from "./stadium";

export { trainingStadium as stadium } from "./stadium";

export const TRAINING_STATE = {
    TRAINING: "TRAINING",
} as const;

export const registry = {
    [TRAINING_STATE.TRAINING]: Training,
};

export const TRAINING_START = {
    state: TRAINING_STATE.TRAINING,
    params: {},
};

export const trackedDiscs = TRAINING_TRACKED_DISCS;
