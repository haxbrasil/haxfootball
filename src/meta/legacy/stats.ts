import type { FieldTeam } from "@runtime/models";
import type { FieldPosition } from "@common/game/game";

export const STAT_SCHEMA_NAME = "haxfootball";

export const Stat = {
    PassAttempt: "pass-attempt",
    PassCompletion: "pass-completion",
    PassingTouchdown: "passing-touchdown",
    InterceptionThrown: "interception-thrown",
    Reception: "reception",
    ReceivingTouchdown: "receiving-touchdown",
    Carry: "carry",
    QuarterbackCarry: "quarterback-carry",
    RushingTouchdown: "rushing-touchdown",
    FumbleLost: "fumble-lost",
    Return: "return",
    ReturnTouchdown: "return-touchdown",
    FieldGoalMade: "field-goal-made",
    FieldGoalMissed: "field-goal-missed",
    ExtraPointMade: "extra-point-made",
    ExtraPointMissed: "extra-point-missed",
    PassBlocked: "pass-blocked",
    Tackle: "tackle",
    Sack: "sack",
    Interception: "interception",
    PickSix: "pick-six",
    ForcedFumble: "forced-fumble",
    SackTaken: "sack-taken",
    StripSackTaken: "strip-sack-taken",
    ThrownFumble: "thrown-fumble",
    Foul: "foul",
    Invasion: "invasion",
    AccumulatedInvasion: "accumulated-invasion",
} as const;

export type Stat = (typeof Stat)[keyof typeof Stat];
export type LegacyStatEventType = Stat;

export type LegacyStatValue = {
    source: string;
    team?: FieldTeam;
    down?: number;
    distance?: number;
    startFieldPosition?: FieldPosition;
    endFieldPosition?: FieldPosition;
    yards?: number;
    airYards?: number;
    yardsAfterCatch?: number;
    touchdown?: boolean;
    passer?: number;
    receiver?: number;
    runner?: number;
    tackled?: number;
    tackler?: number;
    tacklers?: number[];
    fumbler?: number;
    forcedBy?: number[];
    blocker?: number;
    sacker?: number;
    sackers?: number[];
    sacked?: number;
    interceptor?: number;
    kicker?: number;
    returner?: number;
} & Record<string, unknown>;

export type LegacyStatEventInput = {
    type: LegacyStatEventType;
    playerId: number;
    value: LegacyStatValue;
};

type JsonExpression = unknown;

const numberValueSchema = { type: "number" } as const;
const stringValueSchema = { type: "string" } as const;
const booleanValueSchema = { type: "boolean" } as const;
const fieldPositionSchema = {
    type: "object",
    properties: {
        side: numberValueSchema,
        yards: numberValueSchema,
    },
} as const;

const statValueSchema = {
    type: "object",
    required: ["source"],
    properties: {
        source: stringValueSchema,
        team: numberValueSchema,
        down: numberValueSchema,
        distance: numberValueSchema,
        startFieldPosition: fieldPositionSchema,
        endFieldPosition: fieldPositionSchema,
        yards: numberValueSchema,
        airYards: numberValueSchema,
        yardsAfterCatch: numberValueSchema,
        touchdown: booleanValueSchema,
        passer: numberValueSchema,
        receiver: numberValueSchema,
        runner: numberValueSchema,
        tackled: numberValueSchema,
        tackler: numberValueSchema,
        tacklers: {
            type: "array",
            items: numberValueSchema,
        },
        fumbler: numberValueSchema,
        forcedBy: {
            type: "array",
            items: numberValueSchema,
        },
        blocker: numberValueSchema,
        sacker: numberValueSchema,
        sackers: {
            type: "array",
            items: numberValueSchema,
        },
        sacked: numberValueSchema,
        interceptor: numberValueSchema,
        kicker: numberValueSchema,
        returner: numberValueSchema,
    },
} as const;

const count = (metric: string) => ({
    metric,
    initial: 0,
    step: { op: "add", args: [{ path: "acc" }, 1] },
});

const sumValue = (metric: string, path: string) => ({
    metric,
    initial: 0,
    step: {
        op: "add",
        args: [{ path: "acc" }, { path }],
    },
});

const event = (type: Stat, aggregations: Array<Record<string, unknown>>) => ({
    type,
    valueSchema: statValueSchema,
    aggregations,
});

const metric = (name: string): JsonExpression => ({
    path: `metrics.${name}`,
});

const weighted = (name: string, weight: number): JsonExpression => ({
    op: "multiply",
    args: [metric(name), weight],
});

const add = (...args: JsonExpression[]): JsonExpression => ({
    op: "add",
    args,
});

export const statEventSchemaDefinition = {
    events: [
        event(Stat.PassAttempt, [count("pass-attempts")]),
        event(Stat.PassCompletion, [
            count("pass-completions"),
            sumValue("passing-yards", "event.value.yards"),
        ]),
        event(Stat.PassingTouchdown, [count("passing-touchdowns")]),
        event(Stat.InterceptionThrown, [count("interceptions-thrown")]),
        event(Stat.Reception, [
            count("receptions"),
            sumValue("receiving-yards", "event.value.yards"),
            sumValue("yards-after-catch", "event.value.yardsAfterCatch"),
        ]),
        event(Stat.ReceivingTouchdown, [count("receiving-touchdowns")]),
        event(Stat.Carry, [
            count("carries"),
            sumValue("rushing-yards", "event.value.yards"),
        ]),
        event(Stat.QuarterbackCarry, [
            count("quarterback-carries"),
            sumValue("rushing-yards", "event.value.yards"),
        ]),
        event(Stat.RushingTouchdown, [count("rushing-touchdowns")]),
        event(Stat.FumbleLost, [count("fumbles-lost")]),
        event(Stat.Return, [
            count("returns"),
            sumValue("return-yards", "event.value.yards"),
        ]),
        event(Stat.ReturnTouchdown, [count("return-touchdowns")]),
        event(Stat.FieldGoalMade, [
            count("field-goals-made"),
            sumValue("field-goal-yards", "event.value.yards"),
        ]),
        event(Stat.FieldGoalMissed, [count("field-goals-missed")]),
        event(Stat.ExtraPointMade, [count("extra-points-made")]),
        event(Stat.ExtraPointMissed, [count("extra-points-missed")]),
        event(Stat.PassBlocked, [count("passes-blocked")]),
        event(Stat.Tackle, [count("tackles")]),
        event(Stat.Sack, [count("sacks")]),
        event(Stat.Interception, [count("interceptions")]),
        event(Stat.PickSix, [count("pick-sixes")]),
        event(Stat.ForcedFumble, [count("forced-fumbles")]),
        event(Stat.SackTaken, [
            count("sacks-taken"),
            sumValue("sack-yards-lost", "event.value.yards"),
        ]),
        event(Stat.StripSackTaken, [count("strip-sacks-taken")]),
        event(Stat.ThrownFumble, [count("thrown-fumbles")]),
        event(Stat.Foul, [count("fouls")]),
        event(Stat.Invasion, [count("invasions")]),
        event(Stat.AccumulatedInvasion, [count("accumulated-invasions")]),
    ],
    virtualMetrics: [
        {
            metric: "fantasy-points",
            value: add(
                weighted("receptions", 1.5),
                weighted("receiving-yards", 0.3),
                weighted("yards-after-catch", 0.1),
                weighted("rushing-yards", 0.5),
                weighted("receiving-touchdowns", 6),
                weighted("rushing-touchdowns", 6),
                weighted("fumbles-lost", -6),
                weighted("return-touchdowns", 6),
                weighted("field-goal-yards", 0.1),
                weighted("field-goals-missed", -2),
                weighted("pass-completions", 2),
                weighted("passing-yards", 0.1),
                weighted("passing-touchdowns", 4),
                weighted("interceptions-thrown", -6),
                weighted("sack-yards-lost", -0.5),
                weighted("sacks-taken", -1),
                weighted("strip-sacks-taken", -4),
                weighted("thrown-fumbles", -6),
                weighted("passes-blocked", 3),
                weighted("tackles", 1.5),
                weighted("sacks", 6),
                weighted("interceptions", 12),
                weighted("pick-sixes", 6),
                weighted("forced-fumbles", 8),
                weighted("fouls", -3),
            ),
        },
    ],
} as const;
