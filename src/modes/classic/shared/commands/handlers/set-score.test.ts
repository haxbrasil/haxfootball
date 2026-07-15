import { describe, expect, it } from "vitest";
import { parseSetScoreArgs } from "./set-score";

describe("parseSetScoreArgs", () => {
    it("parses red and blue scores", () => {
        expect(parseSetScoreArgs(["14", "7"])).toEqual({
            red: 14,
            blue: 7,
        });
    });

    it("accepts zero scores", () => {
        expect(parseSetScoreArgs(["0", "0"])).toEqual({ red: 0, blue: 0 });
    });

    it("accepts the native maximum score", () => {
        expect(parseSetScoreArgs(["255", "255"])).toEqual({
            red: 255,
            blue: 255,
        });
    });

    it.each([
        { args: [] },
        { args: ["7"] },
        { args: ["7", "3", "0"] },
        { args: ["-1", "3"] },
        { args: ["7.5", "3"] },
        { args: ["red", "3"] },
        { args: ["256", "3"] },
    ])("rejects invalid arguments: $args", ({ args }) => {
        expect(parseSetScoreArgs(args)).toBeNull();
    });
});
