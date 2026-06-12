export type IncidentKind =
    | "desync"
    | "uncaught-exception"
    | "unhandled-rejection";

type IncidentRecordData = Record<string, unknown>;

export type IncidentRecord = {
    at: string;
    type: string;
    data: unknown;
};

export type IncidentSnapshot = {
    scores: ScoresObject | null;
    ball: Position | null;
    discCount: number | null;
    players: Array<{
        id: number;
        name: string;
        team: TeamID;
        admin: boolean;
        position: Position | null;
    }>;
};

export type IncidentPayload = {
    kind: IncidentKind;
    occurredAt: string;
    reason?: string;
    playerId?: number;
    tick?: number;
    records: IncidentRecord[];
    snapshot?: IncidentSnapshot;
};

type IncidentRecorderOptions = {
    windowMs?: number;
    maxRecords?: number;
};

const DEFAULT_WINDOW_MS = 5_000;
const DEFAULT_MAX_RECORDS = 2_000;
const MAX_SANITIZE_DEPTH = 6;
const SENSITIVE_KEY_PATTERN = /token|jwt|auth|conn|ip|password|secret/i;

export class IncidentRecorder {
    private records: Array<IncidentRecord & { time: number }> = [];
    private readonly windowMs: number;
    private readonly maxRecords: number;
    private snapshotProvider: (() => IncidentSnapshot | undefined) | null = null;

    public constructor(options: IncidentRecorderOptions = {}) {
        this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
        this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
    }

    public setSnapshotProvider(
        provider: (() => IncidentSnapshot | undefined) | null,
    ): void {
        this.snapshotProvider = provider;
    }

    public record(type: string, data: IncidentRecordData = {}): void {
        const now = Date.now();

        this.records.push({
            at: new Date(now).toISOString(),
            time: now,
            type,
            data: sanitizeIncidentValue(data),
        });
        this.trim(now);
    }

    public captureIncident(
        kind: IncidentKind,
        context: {
            reason?: string;
            playerId?: number;
            tick?: number;
        } = {},
    ): IncidentPayload {
        const now = Date.now();
        const occurredAt = new Date(now).toISOString();

        this.record("incident-trigger", { kind, ...context });
        this.trim(now);

        const snapshot = this.snapshotProvider?.();

        return {
            kind,
            occurredAt,
            ...(context.reason ? { reason: context.reason } : {}),
            ...(typeof context.playerId === "number"
                ? { playerId: context.playerId }
                : {}),
            ...(typeof context.tick === "number" ? { tick: context.tick } : {}),
            records: this.records.map(({ time: _time, ...record }) => record),
            ...(snapshot ? { snapshot } : {}),
        };
    }

    private trim(now: number): void {
        const oldest = now - this.windowMs;

        while (
            this.records.length > 0 &&
            (this.records.length > this.maxRecords ||
                (this.records[0]?.time ?? now) < oldest)
        ) {
            this.records.shift();
        }
    }
}

export function sanitizeIncidentValue(value: unknown, depth = 0): unknown {
    if (depth >= MAX_SANITIZE_DEPTH) {
        return "[max-depth]";
    }

    if (Array.isArray(value)) {
        return value.map((entry) => sanitizeIncidentValue(entry, depth + 1));
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    const output: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
        output[key] = SENSITIVE_KEY_PATTERN.test(key)
            ? "[redacted]"
            : sanitizeIncidentValue(entry, depth + 1);
    }

    return output;
}
