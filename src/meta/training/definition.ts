import type { GameMetaDefinition } from "@meta/types";
import { GAME_MODE } from "@meta/types";
import { registry, stadium, trackedDiscs, TRAINING_START } from "./meta";

export const trainingMetaDefinition: GameMetaDefinition = {
    name: GAME_MODE.TRAINING,
    label: "Training",
    stadium,
    registry,
    start: TRAINING_START,
    room: {
        scoreLimit: 0,
        timeLimit: 0,
    },
    persistsMatches: false,
    createRuntime() {
        return {
            commands: [],
            createEngineOptions() {
                return {
                    config: {},
                    trackedDiscs,
                };
            },
            handleCommand() {
                return null;
            },
            syncGameScore(_engine, gameScoreStore) {
                gameScoreStore?.reset();
            },
            handleGameStop({ gameScoreStore }) {
                gameScoreStore?.reset();
            },
        };
    },
};
