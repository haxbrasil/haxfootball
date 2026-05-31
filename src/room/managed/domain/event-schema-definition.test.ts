import { describe, expect, it } from "vitest";
import { sameEventSchemaDefinition } from "./event-schema-definition";

describe("sameEventSchemaDefinition", () => {
    it("matches definitions with different object key order", () => {
        const left = {
            events: [
                {
                    type: "carry",
                    valueSchema: {
                        properties: {
                            yards: { type: "number" },
                            source: { type: "string" },
                        },
                        required: ["source"],
                        type: "object",
                    },
                    aggregations: [
                        {
                            metric: "carries",
                            initial: 0,
                            step: {
                                args: [{ path: "acc" }, 1],
                                op: "add",
                            },
                        },
                    ],
                },
            ],
        };
        const right = {
            events: [
                {
                    aggregations: [
                        {
                            step: {
                                op: "add",
                                args: [{ path: "acc" }, 1],
                            },
                            initial: 0,
                            metric: "carries",
                        },
                    ],
                    valueSchema: {
                        type: "object",
                        required: ["source"],
                        properties: {
                            source: { type: "string" },
                            yards: { type: "number" },
                        },
                    },
                    type: "carry",
                },
            ],
        };

        expect(sameEventSchemaDefinition(left, right)).toBe(true);
    });

    it("ignores undefined object fields", () => {
        expect(
            sameEventSchemaDefinition(
                {
                    events: [
                        {
                            type: "carry",
                            description: undefined,
                        },
                    ],
                },
                {
                    events: [
                        {
                            type: "carry",
                        },
                    ],
                },
            ),
        ).toBe(true);
    });

    it("detects changed aggregations", () => {
        expect(
            sameEventSchemaDefinition(
                {
                    events: [
                        {
                            type: "carry",
                            aggregations: [
                                {
                                    metric: "carries",
                                    initial: 0,
                                    step: {
                                        op: "add",
                                        args: [{ path: "acc" }, 1],
                                    },
                                },
                            ],
                        },
                    ],
                },
                {
                    events: [
                        {
                            type: "carry",
                            aggregations: [
                                {
                                    metric: "carries",
                                    initial: 0,
                                    step: {
                                        op: "add",
                                        args: [{ path: "acc" }, 2],
                                    },
                                },
                            ],
                        },
                    ],
                },
            ),
        ).toBe(false);
    });
});
