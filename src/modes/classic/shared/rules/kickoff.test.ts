import { describe, expect, it } from "vitest";
import { getKickoffTimeoutElapsedTicks } from "./kickoff";

describe("getKickoffTimeoutElapsedTicks", () => {
    it("does not count the initial kickoff while native time is zero", () => {
        expect(
            getKickoffTimeoutElapsedTicks({
                isInitialKickoff: true,
                nativeTime: 0,
                stateElapsedTicks: 600,
            }),
        ).toBeNull();
    });

    it("uses native match time after the initial kickoff clock starts", () => {
        expect(
            getKickoffTimeoutElapsedTicks({
                isInitialKickoff: true,
                nativeTime: 0.5,
                stateElapsedTicks: 600,
            }),
        ).toBe(30);
    });

    it("uses state elapsed ticks for later kickoffs", () => {
        expect(
            getKickoffTimeoutElapsedTicks({
                isInitialKickoff: false,
                nativeTime: 30,
                stateElapsedTicks: 120,
            }),
        ).toBe(120);
    });
});
