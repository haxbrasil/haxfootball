import type { ScoreState } from "@common/game/game";
import { Team } from "@runtime/models";

export type GameScore = {
    red: number;
    blue: number;
};

export type GameScoreReader = () => GameScore | null;

export type GameScoreStore = {
    get: GameScoreReader;
    reset(): void;
    set(score: ScoreState | null | undefined): void;
};

export function createGameScoreStore(): GameScoreStore {
    let score: GameScore | null = null;

    return {
        get: () => score,
        reset: () => {
            score = null;
        },
        set: (nextScore) => {
            score = nextScore
                ? {
                      red: nextScore[Team.RED],
                      blue: nextScore[Team.BLUE],
                  }
                : null;
        },
    };
}
