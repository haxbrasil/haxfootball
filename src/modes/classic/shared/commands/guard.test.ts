import { describe, expect, it } from "vitest";
import { createGuard } from "./guard";

describe("createGuard", () => {
    it("blocks another actor during the guard window", () => {
        let timestamp = 0;
        const guard = createGuard(() => timestamp);

        expect(guard.tryAcquire("undo", 1, 1_000)).toBe(true);

        timestamp = 999;
        expect(guard.tryAcquire("undo", 2, 1_000)).toBe(false);
    });

    it("allows another actor after the guard window", () => {
        let timestamp = 0;
        const guard = createGuard(() => timestamp);

        expect(guard.tryAcquire("undo", 1, 1_000)).toBe(true);

        timestamp = 1_000;
        expect(guard.tryAcquire("undo", 2, 1_000)).toBe(true);
    });

    it("allows repeated acquisitions from the same actor", () => {
        let timestamp = 0;
        const guard = createGuard(() => timestamp);

        expect(guard.tryAcquire("undo", 1, 1_000)).toBe(true);

        timestamp = 500;
        expect(guard.tryAcquire("undo", 1, 1_000)).toBe(true);
    });

    it("tracks guard identifiers independently", () => {
        const guard = createGuard(() => 0);

        expect(guard.tryAcquire("undo", 1, 1_000)).toBe(true);
        expect(guard.tryAcquire("another-command", 2, 1_000)).toBe(true);
    });
});
