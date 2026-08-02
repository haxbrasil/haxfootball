import { describe, expect, it } from "vitest";
import { GAME_BALL_DISC_REF } from "@core/ball";
import { flagStadium } from "./stadium";

describe("Flag stadium game ball", () => {
    it("uses an invisible native ball followed by the visible game ball", () => {
        expect(flagStadium.ballPhysics).toBe("disc0");
        expect(flagStadium.discs?.[0]).toMatchObject({
            pos: [0, 0],
            speed: [0, 0],
            radius: 0,
            invMass: 1,
            damping: 1,
            color: "transparent",
            cMask: [],
            cGroup: [],
        });
        expect(flagStadium.discs?.[1]).toMatchObject({
            ref: GAME_BALL_DISC_REF,
            radius: expect.any(Number),
            cMask: ["red", "blue", "wall"],
            cGroup: ["ball", "kick", "score"],
        });
    });
});
