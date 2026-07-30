import { describe, expect, it } from "vitest";
import { Team, type FieldTeam } from "@runtime/models";
import {
    getBallPath,
    getGoalLine,
    isPotentialFieldGoalTrajectory,
} from "./bounds";

const BALL_RADIUS = 7.85;

describe.each([
    { offense: Team.RED, goal: Team.BLUE, originX: 700, xSpeed: 10 },
    { offense: Team.BLUE, goal: Team.RED, originX: -700, xSpeed: -10 },
] as const)(
    "potential field-goal trajectories toward $goal",
    ({ goal, originX, xSpeed }) => {
        const rayTo = (originY: number, crossingY: number) => {
            const goalX = getGoalLine(goal).start.x;
            const ticksToGoal = (goalX - originX) / xSpeed;

            return getBallPath(
                originX,
                originY,
                xSpeed,
                (crossingY - originY) / ticksToGoal,
            );
        };

        const couldScore = (originY: number, crossingY: number) =>
            isPotentialFieldGoalTrajectory(
                rayTo(originY, crossingY),
                goal as FieldTeam,
                BALL_RADIUS,
            );

        it("accepts centered and radius-overlap trajectories", () => {
            expect(couldScore(0, 0)).toBe(true);
            expect(couldScore(0, 60)).toBe(true);
            expect(couldScore(0, 67.8)).toBe(true);
        });

        it("defers an outer-hash trajectory that could contact a post", () => {
            expect(couldScore(70, 70)).toBe(true);
            expect(couldScore(70, 71.8)).toBe(true);
        });

        it("rejects only trajectories clear of both the goal and posts", () => {
            expect(couldScore(70, 72)).toBe(false);
            expect(couldScore(70, 80)).toBe(false);
            expect(couldScore(-70, -72)).toBe(false);
        });
    },
);
