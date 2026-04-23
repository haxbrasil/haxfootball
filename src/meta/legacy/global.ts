import { FieldTeam, Team } from "@runtime/models";
import { type ScoreState } from "@common/game/game";
import { defineGlobalSchema } from "@runtime/global";

type PlayerSnapProfile = {
    playerId: number;
    averageY: number;
    averageX: number;
    count: number;
};

type PossessionQuarterback = {
    playerId: number;
    team: FieldTeam;
};

const initialState = {
    scores: {
        [Team.RED]: 0,
        [Team.BLUE]: 0,
    } as ScoreState,
    snapProfile: [] as PlayerSnapProfile[],
    possessionQuarterback: null as PossessionQuarterback | null,
};

export const legacyGlobalSchema = defineGlobalSchema({
    state: initialState,
    actions: {
        incrementScore: (state, team: FieldTeam, points: number) => ({
            ...state,
            scores: {
                ...state.scores,
                [team]: state.scores[team] + points,
            },
        }),
        updateSnapProfile: (state, playerId: number, position: Position) => {
            const existingProfile = state.snapProfile.find(
                (profile) => profile.playerId === playerId,
            );

            if (!existingProfile) {
                return {
                    ...state,
                    snapProfile: [
                        ...state.snapProfile,
                        {
                            playerId,
                            averageY: position.y,
                            averageX: position.x,
                            count: 1,
                        },
                    ],
                };
            }

            return {
                ...state,
                snapProfile: state.snapProfile.map((profile) => {
                    if (profile.playerId !== playerId) {
                        return profile;
                    }

                    return {
                        playerId,
                        averageY:
                            (profile.averageY * profile.count + position.y) /
                            (profile.count + 1),
                        averageX:
                            (profile.averageX * profile.count + position.x) /
                            (profile.count + 1),
                        count: profile.count + 1,
                    };
                }),
            };
        },
        clearSnapProfile: (state) => ({
            ...state,
            snapProfile: [],
        }),
        setPossessionQuarterback: (
            state,
            playerId: number,
            team: FieldTeam,
        ) => ({
            ...state,
            possessionQuarterback: {
                playerId,
                team,
            },
        }),
        clearPossessionQuarterback: (state) => ({
            ...state,
            possessionQuarterback: null,
        }),
    },
});
