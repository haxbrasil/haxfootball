import { describe, expect, it } from "vitest";
import { classicStadiumSchema } from "./__fixtures__/classic-stadium";
import { defineStadium } from "./stadium-generator";

describe("defineStadium", () => {
    it("generates the classic stadium from the schema API", () => {
        const { stadium } = defineStadium(classicStadiumSchema);

        expect(stadium.name).toBe("BFL (Classic)");
        expect(stadium.segments?.some((segment) => segment.ref)).toBe(true);
        expect(stadium.discs?.some((disc) => disc.ref)).toBe(true);
        expect(stadium.joints?.some((joint) => joint.ref)).toBe(true);
    });
});
