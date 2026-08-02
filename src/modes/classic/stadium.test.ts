import { describe, expect, it } from "vitest";
import { GAME_BALL_DISC_REF } from "@core/ball";
import { classicStadium } from "./stadium";

describe("Classic stadium game ball", () => {
    it("uses an invisible native ball followed by the visible game ball", () => {
        expect(classicStadium.ballPhysics).toBe("disc0");
        expect(classicStadium.discs?.[0]).toMatchObject({
            pos: [0, 0],
            speed: [0, 0],
            radius: 0,
            invMass: 1,
            damping: 1,
            color: "transparent",
            cMask: [],
            cGroup: [],
        });
        expect(classicStadium.discs?.[1]).toMatchObject({
            ref: GAME_BALL_DISC_REF,
            radius: expect.any(Number),
            cMask: ["red", "blue", "wall"],
            cGroup: ["ball", "kick", "score"],
        });
    });
});
