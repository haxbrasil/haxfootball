import { describe, expect, it } from "vitest";
import type { StadiumLineColors, StadiumMeasures } from "./stadium-builder";
import { buildStadium } from "./stadium-builder";

describe("buildStadium", () => {
    it("derives hash marks from yard length and subdivision", () => {
        const measures: StadiumMeasures = {
            name: "Test Stadium",
            size: { width: 300, height: 200 },
            field: { width: 200, height: 100 },
            endZones: { depth: 0 },
            goal: { width: 20 },
            yard: {
                length: 10,
                lines: { intervalYards: 10, redZoneYards: 20 },
            },
            hashMarks: {
                bandTopY: -20,
                bandBottomY: 20,
                markHeight: 10,
                subdivisionYards: 2,
            },
        };

        const colors: StadiumLineColors = {
            yard: {
                default: "FFFFFF",
                goal: "FFEA00",
                redZone: "D0312D",
                midfield: "ACDE97",
            },
            hash: "FFFFFF",
            tick: "FFFFFF",
        };

        const { stadium, index } = buildStadium({ measures, colors });

        const segmentNames = Object.keys(index.names.segments);
        const topHashNames = segmentNames.filter((name) =>
            name.startsWith("hashMarkTop"),
        );
        const bottomHashNames = segmentNames.filter((name) =>
            name.startsWith("hashMarkBottom"),
        );

        expect(topHashNames).toHaveLength(8);
        expect(bottomHashNames).toHaveLength(8);

        const getX = (name: string) => {
            const segmentIndex = index.names.segments[name];

            if (segmentIndex === undefined) {
                throw new Error(`Missing segment ${name}`);
            }

            const segment = stadium.segments?.[segmentIndex];

            if (!segment) {
                throw new Error(`Missing segment data for ${name}`);
            }

            const v0 = stadium.vertexes?.[segment.v0];
            const v1 = stadium.vertexes?.[segment.v1];

            if (!v0 || !v1) {
                throw new Error(`Missing vertex data for ${name}`);
            }

            expect(v0.x).toBe(v1.x);

            return v0.x;
        };

        const hashXs = topHashNames.map(getX).sort((a, b) => a - b);
        const expected = [-80, -60, -40, -20, 20, 40, 60, 80];

        expect(hashXs).toEqual(expected);

        const midfieldIndex = index.names.segments["midfieldLine"];

        if (midfieldIndex === undefined) {
            throw new Error("Missing midfield line index");
        }

        const midfield = stadium.segments?.[midfieldIndex];
        const v0 = midfield ? stadium.vertexes?.[midfield.v0] : null;

        expect(v0?.x).toBe(0);
    });
});
