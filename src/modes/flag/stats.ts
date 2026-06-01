import type { FieldTeam } from "@runtime/models";
import type { FieldPosition } from "@common/game/game";

export const EVENT_SCHEMA_NAME = "haxfootball";
export const GAME_MODE_NAME = "haxfootball";

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
export type FlagStatEventType = Stat;

export type FlagStatValue = {
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

export type FlagStatEventInput = {
    type: FlagStatEventType;
    playerId: number;
    value: FlagStatValue;
};

type JsonExpression = unknown;

const numberValueSchema = { type: "number" } as const;
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
    properties: {
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
    target: "actor",
    metric,
    initial: 0,
    step: { op: "add", args: [{ path: "acc" }, 1] },
});

const sumValue = (metric: string, path: string) => ({
    target: "actor",
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

const StatCategory = {
    Defense: "category.defense",
    Fantasy: "category.fantasy",
    Misc: "category.misc",
    Passing: "category.passing",
    Receiving: "category.receiving",
    Rushing: "category.rushing",
    SpecialTeams: "category.special-teams",
} as const;

const statMetric = (key: string, category: string) => ({
    key,
    label: `metric.${key}`,
    category,
    valueType: "number",
    format: "integer",
});

const statCategory = (key: string, primaryMetric: string) => ({
    key,
    label: key,
    primaryMetric,
});

export const eventSchemaDefinition = {
    presentation: {
        label: "schema.haxfootball",
        description: "schema.haxfootball.description",
    },
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
    featuredMetrics: {
        points: "fantasy-points",
    },
    categories: [
        statCategory(StatCategory.Fantasy, "fantasy-points"),
        statCategory(StatCategory.Passing, "passing-yards"),
        statCategory(StatCategory.Receiving, "receiving-yards"),
        statCategory(StatCategory.Rushing, "rushing-yards"),
        statCategory(StatCategory.SpecialTeams, "return-yards"),
        statCategory(StatCategory.Defense, "tackles"),
        statCategory(StatCategory.Misc, "accumulated-invasions"),
    ],
    metrics: [
        statMetric("fantasy-points", StatCategory.Fantasy),
        statMetric("pass-attempts", StatCategory.Passing),
        statMetric("pass-completions", StatCategory.Passing),
        statMetric("passing-yards", StatCategory.Passing),
        statMetric("passing-touchdowns", StatCategory.Passing),
        statMetric("interceptions-thrown", StatCategory.Passing),
        statMetric("sacks-taken", StatCategory.Passing),
        statMetric("sack-yards-lost", StatCategory.Passing),
        statMetric("strip-sacks-taken", StatCategory.Passing),
        statMetric("thrown-fumbles", StatCategory.Passing),
        statMetric("receptions", StatCategory.Receiving),
        statMetric("receiving-yards", StatCategory.Receiving),
        statMetric("yards-after-catch", StatCategory.Receiving),
        statMetric("receiving-touchdowns", StatCategory.Receiving),
        statMetric("fumbles-lost", StatCategory.Receiving),
        statMetric("carries", StatCategory.Rushing),
        statMetric("quarterback-carries", StatCategory.Rushing),
        statMetric("rushing-yards", StatCategory.Rushing),
        statMetric("rushing-touchdowns", StatCategory.Rushing),
        statMetric("returns", StatCategory.SpecialTeams),
        statMetric("return-yards", StatCategory.SpecialTeams),
        statMetric("return-touchdowns", StatCategory.SpecialTeams),
        statMetric("field-goals-made", StatCategory.SpecialTeams),
        statMetric("field-goal-yards", StatCategory.SpecialTeams),
        statMetric("field-goals-missed", StatCategory.SpecialTeams),
        statMetric("extra-points-made", StatCategory.SpecialTeams),
        statMetric("extra-points-missed", StatCategory.SpecialTeams),
        statMetric("passes-blocked", StatCategory.Defense),
        statMetric("tackles", StatCategory.Defense),
        statMetric("sacks", StatCategory.Defense),
        statMetric("interceptions", StatCategory.Defense),
        statMetric("pick-sixes", StatCategory.Defense),
        statMetric("forced-fumbles", StatCategory.Defense),
        statMetric("fouls", StatCategory.Misc),
        statMetric("invasions", StatCategory.Misc),
        statMetric("accumulated-invasions", StatCategory.Misc),
    ],
} as const;

export const eventSchemaValues = [
    label("schema.haxfootball", "HaxFootball", "HaxFootball"),
    label(
        "schema.haxfootball.description",
        "Default HaxFootball room stat events.",
        "Eventos estatísticos padrão da sala HaxFootball.",
    ),
    label("category.fantasy", "Fantasy", "Fantasy"),
    label("category.passing", "Passing", "Passe"),
    label("category.receiving", "Receiving", "Recebendo"),
    label("category.rushing", "Rushing", "Corrida"),
    label("category.special-teams", "Special teams", "Times especiais"),
    label("category.defense", "Defense", "Defesa"),
    label("category.misc", "Misc", "Outros"),
    label("metric.pass-attempts", "Pass attempts", "Tentativas de passe"),
    label("metric.pass-completions", "Pass completions", "Passes completos"),
    label("metric.passing-yards", "Passing yards", "Jardas passadas"),
    label(
        "metric.passing-touchdowns",
        "Passing touchdowns",
        "Touchdowns passados",
    ),
    label(
        "metric.interceptions-thrown",
        "Interceptions thrown",
        "Interceptações lançadas",
    ),
    label("metric.receptions", "Receptions", "Recepções"),
    label("metric.receiving-yards", "Receiving yards", "Jardas recebidas"),
    label(
        "metric.yards-after-catch",
        "Yards after catch",
        "Jardas após recepção",
    ),
    label(
        "metric.receiving-touchdowns",
        "Receiving touchdowns",
        "Touchdowns recebidos",
    ),
    label("metric.carries", "Carries", "Corridas"),
    label(
        "metric.quarterback-carries",
        "Quarterback carries",
        "Corridas do quarterback",
    ),
    label("metric.rushing-yards", "Rushing yards", "Jardas corridas"),
    label(
        "metric.rushing-touchdowns",
        "Rushing touchdowns",
        "Touchdowns corridos",
    ),
    label("metric.fumbles-lost", "Fumbles lost", "Fumbles perdidos"),
    label("metric.returns", "Returns", "Retornos"),
    label("metric.return-yards", "Return yards", "Jardas de retorno"),
    label(
        "metric.return-touchdowns",
        "Return touchdowns",
        "Touchdowns de retorno",
    ),
    label("metric.field-goals-made", "Field goals made", "Field goals feitos"),
    label(
        "metric.field-goal-yards",
        "Field goal yards",
        "Jardas de field goal",
    ),
    label(
        "metric.field-goals-missed",
        "Field goals missed",
        "Field goals errados",
    ),
    label(
        "metric.extra-points-made",
        "Extra points made",
        "Extra points feitos",
    ),
    label(
        "metric.extra-points-missed",
        "Extra points missed",
        "Extra points errados",
    ),
    label("metric.passes-blocked", "Passes blocked", "Passes bloqueados"),
    label("metric.tackles", "Tackles", "Tackles"),
    label("metric.sacks", "Sacks", "Sacks"),
    label("metric.interceptions", "Interceptions", "Interceptações"),
    label("metric.pick-sixes", "Pick-sixes", "Pick-sixes"),
    label("metric.forced-fumbles", "Forced fumbles", "Fumbles forçados"),
    label("metric.sacks-taken", "Sacks taken", "Sacks sofridos"),
    label(
        "metric.sack-yards-lost",
        "Sack yards lost",
        "Jardas perdidas em sack",
    ),
    label(
        "metric.strip-sacks-taken",
        "Strip sacks taken",
        "Strip sacks sofridos",
    ),
    label("metric.thrown-fumbles", "Thrown fumbles", "Fumbles lançados"),
    label("metric.fouls", "Fouls", "Faltas"),
    label("metric.invasions", "Invasions", "Invasões"),
    label(
        "metric.accumulated-invasions",
        "Accumulated invasions",
        "Invasões acumuladas",
    ),
    label("metric.fantasy-points", "Fantasy points", "Pontos fantasy"),
].flat();

function label(value: string, en: string, pt: string) {
    return [
        { value, language: "en", label: en },
        { value, language: "pt", label: pt },
    ];
}
