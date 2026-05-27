import { describe, expect, it } from "vitest";
import {
    classicStadiumObjectOutput,
    classicStadiumSchema,
} from "./__fixtures__/classic-stadium";
import { defineStadium } from "./stadium-generator";

describe("defineStadium", () => {
    it("reproduces the classic stadium from the new schema API", () => {
        const { stadium } = defineStadium(classicStadiumSchema);

        expect(stadium).toEqual(classicStadiumObjectOutput);
    });
});
