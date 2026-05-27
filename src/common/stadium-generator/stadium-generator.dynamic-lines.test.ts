import { describe, expect, it } from "vitest";
import { defineStadium } from "@common/stadium-generator/stadium-generator";
import type { StadiumSchema } from "@common/stadium-generator/stadium-generator";
import { classicStadium, classicStadiumIndex } from "@modes/classic/stadium";
import type { Joint, StadiumObject } from "@haxball/stadium";

const findJoint = (joints: Joint[] | undefined, d0: number, d1: number) =>
    joints?.find(
        (joint) =>
            (joint.d0 === d0 && joint.d1 === d1) ||
            (joint.d0 === d1 && joint.d1 === d0),
    );

const getBallOffset = (stadium: StadiumObject | StadiumSchema) =>
    stadium.ballPhysics === "disc0" ? 0 : 1;

describe("defineStadium dynamic lines", () => {
    it("offsets dynamic line joints when the ball disc is injected", () => {
        const schema: StadiumSchema = {
            name: "Dynamic Lines",
            width: 100,
            height: 100,
            ballPhysics: { radius: 5, invMass: 1 },
            dynamicLines: [
                { name: "line0", joint: { color: "FFFFFF" } },
                { name: "line1", joint: { color: "FF0000" } },
            ],
        };

        const { stadium, index } = defineStadium(schema);
        const offset = getBallOffset(schema);

        Object.entries(index.dynamicLines.names).forEach(([name, pair]) => {
            expect(pair[1]).toBe(pair[0] + 1);

            const joint = findJoint(
                stadium.joints,
                pair[0] + offset,
                pair[1] + offset,
            );

            expect(joint, `missing joint for ${name}`).toBeDefined();
        });
    });

    it("keeps dynamic line joints aligned when using disc0 as the ball", () => {
        const schema: StadiumSchema = {
            name: "Disc0 Ball",
            width: 100,
            height: 100,
            ballPhysics: "disc0",
            discs: [{ radius: 5, invMass: 1, pos: [0, 0], color: "FFFFFF" }],
            dynamicLines: [{ name: "line0", joint: { color: "FFFFFF" } }],
        };

        const { stadium, index } = defineStadium(schema);
        const offset = getBallOffset(schema);

        const pair = index.dynamicLines.names["line0"];
        expect(pair).toBeDefined();

        if (!pair) return;

        const joint = findJoint(
            stadium.joints,
            pair[0] + offset,
            pair[1] + offset,
        );

        expect(joint).toBeDefined();
    });

    it("applies the same ball offset to anchor-based joints", () => {
        const schema: StadiumSchema = {
            name: "Anchor Joints",
            width: 100,
            height: 100,
            ballPhysics: { radius: 5, invMass: 1 },
            discs: [
                { radius: 1, invMass: 1, pos: [0, 0], color: "FFFFFF" },
                { radius: 1, invMass: 1, pos: [1, 1], color: "FFFFFF" },
            ],
            anchors: [
                { name: "a", index: 0 },
                { name: "b", index: 1 },
            ],
            joints: [{ from: "a", to: "b", color: "FFFFFF" }],
        };

        const { stadium } = defineStadium(schema);
        const offset = getBallOffset(schema);

        const joint = stadium.joints?.[0];
        expect(joint).toBeDefined();

        if (!joint) return;

        expect(joint.d0).toBe(0 + offset);
        expect(joint.d1).toBe(1 + offset);
    });
});

describe("classic stadium dynamic line wiring", () => {
    it("keeps dynamic line discs contiguous and in-range", () => {
        const discs = classicStadium.discs ?? [];

        Object.values(classicStadiumIndex.dynamicLines.names).forEach(
            (pair) => {
                expect(pair[1]).toBe(pair[0] + 1);
                expect(pair[0]).toBeGreaterThanOrEqual(0);
                expect(pair[1]).toBeLessThan(discs.length);
            },
        );
    });

    it("matches every classic dynamic line to a joint", () => {
        const offset = getBallOffset(classicStadium);

        Object.entries(classicStadiumIndex.dynamicLines.names).forEach(
            ([name, pair]) => {
                const joint = findJoint(
                    classicStadium.joints,
                    pair[0] + offset,
                    pair[1] + offset,
                );

                expect(joint, `missing joint for ${name}`).toBeDefined();
            },
        );
    });
});
