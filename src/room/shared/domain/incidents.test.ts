import { describe, expect, it } from "vitest";
import { IncidentRecorder } from "./incidents";

describe("IncidentRecorder", () => {
    it("merges extra records chronologically with room-record tie priority", () => {
        const recorder = new IncidentRecorder();

        recorder.setExtraRecordsProvider(() => [
            {
                at: "2026-01-01T00:00:00.000Z",
                type: "live-trace",
                data: { source: "before" },
            },
            {
                at: "2999-01-01T00:00:00.000Z",
                type: "live-trace",
                data: { source: "after" },
            },
        ]);
        recorder.record("room-operation", { operation: "setScore" });

        const incident = recorder.captureIncident("desync");

        expect(incident.records.map((record) => record.type)).toEqual([
            "live-trace",
            "room-operation",
            "incident-trigger",
            "live-trace",
        ]);
    });

    it("lets the extra record provider choose desync-only full traces", () => {
        const recorder = new IncidentRecorder();

        recorder.setExtraRecordsProvider((kind) =>
            kind === "desync"
                ? [
                      {
                          at: "2026-01-01T00:00:00.000Z",
                          type: "live-trace",
                          data: { bytes: [1, 2, 3] },
                      },
                  ]
                : [],
        );

        expect(
            recorder
                .captureIncident("unhandled-rejection")
                .records.some((record) => record.type === "live-trace"),
        ).toBe(false);
        expect(
            recorder
                .captureIncident("desync")
                .records.some((record) => record.type === "live-trace"),
        ).toBe(true);
    });
});
