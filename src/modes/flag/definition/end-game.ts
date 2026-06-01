import { type ScoreState, opposite } from "@common/game/game";
import { cn, formatTeamName } from "@modes/flag/shared/presentation/message";
import { Team, type FieldTeam } from "@runtime/models";
import { t } from "@lingui/core/macro";

type FlagEndGameReason = "regulation-ended" | "overtime-score";

type FlagMatchResult = {
    status: "complete";
    expectedTimeReached: boolean;
    overage: boolean;
    winnerTeam: FieldTeam;
    loserTeam: FieldTeam;
    finalScore: ScoreState;
    reason: FlagEndGameReason;
    elapsedSeconds: number;
};

type ScoreEvent = {
    team: FieldTeam;
    points: number;
    scoreBefore: ScoreState;
    scoreAfter: ScoreState;
};

const LEGAL_END_STATES = new Set(["PRESNAP"]);

const cloneScore = (score: ScoreState): ScoreState => ({
    [Team.RED]: score[Team.RED],
    [Team.BLUE]: score[Team.BLUE],
});

const isScoreTied = (score: ScoreState): boolean =>
    score[Team.RED] === score[Team.BLUE];

const getWinnerTeam = (score: ScoreState): FieldTeam | null => {
    if (isScoreTied(score)) return null;

    return score[Team.RED] > score[Team.BLUE] ? Team.RED : Team.BLUE;
};

const getScoreEvent = (
    previousScore: ScoreState | null,
    score: ScoreState,
): ScoreEvent | null => {
    if (!previousScore) return null;

    const redDelta = score[Team.RED] - previousScore[Team.RED];
    const blueDelta = score[Team.BLUE] - previousScore[Team.BLUE];

    if (redDelta > 0 && blueDelta === 0) {
        return {
            team: Team.RED,
            points: redDelta,
            scoreBefore: cloneScore(previousScore),
            scoreAfter: cloneScore(score),
        };
    }

    if (blueDelta > 0 && redDelta === 0) {
        return {
            team: Team.BLUE,
            points: blueDelta,
            scoreBefore: cloneScore(previousScore),
            scoreAfter: cloneScore(score),
        };
    }

    return null;
};

export function createEndGameController() {
    let expectedTimeReached = false;
    let overage = false;
    let previousScore: ScoreState | null = null;
    let pendingStop: FlagMatchResult | null = null;
    let completedResult: FlagMatchResult | null = null;
    let tiedOverageAnnouncementPending = false;
    let tiedOverageAnnounced = false;

    const reset = () => {
        expectedTimeReached = false;
        overage = false;
        previousScore = null;
        pendingStop = null;
        completedResult = null;
        tiedOverageAnnouncementPending = false;
        tiedOverageAnnounced = false;
    };

    const buildResult = ({
        elapsedSeconds,
        finalScore,
        reason,
    }: {
        elapsedSeconds: number;
        finalScore: ScoreState;
        reason: FlagEndGameReason;
    }): FlagMatchResult | null => {
        const winnerTeam = getWinnerTeam(finalScore);
        if (!winnerTeam) return null;

        return {
            status: "complete",
            expectedTimeReached,
            overage,
            winnerTeam,
            loserTeam: opposite(winnerTeam),
            finalScore: cloneScore(finalScore),
            reason,
            elapsedSeconds,
        };
    };

    const markPendingStop = (result: FlagMatchResult | null) => {
        pendingStop = result;
    };

    const markTiedOverage = () => {
        overage = true;

        if (!tiedOverageAnnounced) {
            tiedOverageAnnouncementPending = true;
            tiedOverageAnnounced = true;
        }
    };

    const completeIfLegal = (stateName: string | null) => {
        if (!pendingStop || !stateName || !LEGAL_END_STATES.has(stateName)) {
            return null;
        }

        completedResult = pendingStop;

        return completedResult;
    };

    const onTick = ({
        elapsedSeconds,
        score,
        stateName,
        timeLimitSeconds,
    }: {
        elapsedSeconds: number;
        score: ScoreState | null;
        stateName: string | null;
        timeLimitSeconds: number;
    }): FlagMatchResult | null => {
        if (!score) {
            previousScore = null;
            return null;
        }

        const scoreEvent = getScoreEvent(previousScore, score);
        previousScore = cloneScore(score);

        if (timeLimitSeconds > 0 && elapsedSeconds >= timeLimitSeconds) {
            expectedTimeReached = true;
        }

        if (!expectedTimeReached) return null;

        if (pendingStop && !scoreEvent) {
            return completeIfLegal(stateName);
        }

        if (scoreEvent && isScoreTied(scoreEvent.scoreBefore)) {
            overage = true;
            markPendingStop(
                buildResult({
                    elapsedSeconds,
                    finalScore: score,
                    reason: "overtime-score",
                }),
            );
        } else if (isScoreTied(score)) {
            markTiedOverage();
            markPendingStop(null);
        } else {
            markPendingStop(
                buildResult({
                    elapsedSeconds,
                    finalScore: score,
                    reason: overage ? "overtime-score" : "regulation-ended",
                }),
            );
        }

        return completeIfLegal(stateName);
    };

    return {
        consumeTiedOverageAnnouncement: () => {
            const shouldAnnounce = tiedOverageAnnouncementPending;
            tiedOverageAnnouncementPending = false;

            return shouldAnnounce;
        },
        getCompletedResult: () => completedResult,
        onTick,
        reset,
    };
}

export const getFinalScoreAnnouncement = (score: ScoreState): string => {
    if (score[Team.RED] === score[Team.BLUE]) {
        return cn("🏁", score, t`Game ended in a tie!`);
    }

    const winnerTeam =
        score[Team.RED] > score[Team.BLUE] ? Team.RED : Team.BLUE;

    return cn(
        "🏁",
        score,
        t`Victory for the ${formatTeamName(winnerTeam)} team!`,
    );
};
