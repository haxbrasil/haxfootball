import { Room } from "@core/room";
import type { GameState } from "./engine";
import type {
    GlobalSchema,
    GlobalSchemaState,
    GlobalStore,
    GlobalStoreApi,
} from "@runtime/global";

type DiscProps = Parameters<Room["setDiscProperties"]>[1];
type CFType = Room["collisionFlags"];
type SendOptions = Parameters<Room["send"]>[0];
type SendTarget = SendOptions["to"];
type ChatStyle = SendOptions["style"];
type ChatSoundString = SendOptions["sound"];
type TeamValue = Parameters<Room["setTeam"]>[1];
type AvatarValue = Parameters<Room["setAvatar"]>[1];
type AdminValue = Parameters<Room["setAdmin"]>[1];
type PlayerRef = number | PlayerObject;

const toPlayerId = (player: PlayerRef): number =>
    typeof player === "number" ? player : player.id;

type RoomMethodKeys = {
    [K in keyof Room]: Room[K] extends (...args: any[]) => any
        ? K extends "send"
            ? never
            : K
        : never;
}[keyof Room];

type RoomMethodApi = Pick<Room, RoomMethodKeys>;

type DiscPropsPatch = Partial<DiscProps>;

export type MutationBuffer = ReturnType<typeof createMutationBuffer>;
export type TransitionDisposal = "IMMEDIATE" | "DELAYED" | "AFTER_RESUME";
export type Transition = {
    to: string;
    params: any;
    wait?: number;
    disposal?: TransitionDisposal;
    isRestore?: boolean;
    globalStateSnapshot?: unknown;
};

export type Checkpoint = {
    key?: string;
    sourceState: string;
    tickNumber: number;
    transition: Transition;
};

export type CheckpointDraft = {
    key?: string;
    transition: Transition;
};

export type CheckpointRestoreArgs = {
    key?: string;
    consume?: boolean;
};

export type TickState = {
    now: number;
    current: number;
    self: number;
};

export type RuntimeMatchEvent = {
    type: string;
    playerId: number;
    sourceState: string;
    value: Record<string, unknown>;
    tick: number;
};

export type RuntimeMatchEventInput = {
    type: string;
    playerId: number;
    value?: Record<string, unknown>;
};

export type RuntimeMatchEventSink = (event: RuntimeMatchEvent) => void;

const BALL_DEFAULT_INDEX = 0;

const mergeProps =
    <T extends Record<string, any>>(map: Map<number, T>) =>
    (key: number, props: T) => {
        const existing = map.get(key);
        if (existing) {
            Object.assign(existing, props);
            return;
        }
        map.set(key, { ...props });
    };

export function createMutationBuffer(room: Room) {
    const discProps = new Map<number, DiscPropsPatch>();
    const playerDiscProps = new Map<number, DiscPropsPatch>();
    const avatars = new Map<number, AvatarValue>();
    const teams = new Map<number, TeamValue>();
    const admins = new Map<number, AdminValue>();

    const queueDiscProps = mergeProps<DiscPropsPatch>(discProps);
    const queuePlayerDiscProps = mergeProps<DiscPropsPatch>(playerDiscProps);

    const trimPatch = <T extends Record<string, any>>(patch: T): T | null => {
        const trimmed: Record<string, any> = {};
        let hasKeys = false;

        Object.entries(patch).forEach(([key, value]) => {
            if (value === null || value === undefined) return;
            trimmed[key] = value;
            hasKeys = true;
        });

        return hasKeys ? (trimmed as T) : null;
    };

    const isNoopPatch = (
        current: DiscPropertiesObject | null,
        patch: DiscPropsPatch,
    ): boolean => {
        if (!current) return false;

        return Object.entries(patch).every(([key, value]) => {
            const currentValue = (current as Record<string, unknown>)[key];
            return currentValue === value;
        });
    };

    return {
        queueDisc: (discIndex: number, props: DiscProps) =>
            queueDiscProps(discIndex, props),
        queuePlayerDisc: (player: PlayerRef, props: DiscProps) =>
            queuePlayerDiscProps(toPlayerId(player), props),
        queueAvatar: (player: PlayerRef, avatar: AvatarValue) => {
            avatars.set(toPlayerId(player), avatar);
        },
        queueTeam: (player: PlayerRef, team: TeamValue) => {
            teams.set(toPlayerId(player), team);
        },
        queueAdmin: (player: PlayerRef, admin: AdminValue) => {
            admins.set(toPlayerId(player), admin);
        },
        flush: () => {
            discProps.forEach((props, discIndex) => {
                const trimmed = trimPatch(props);
                if (!trimmed) return;
                const current = room.getDiscProperties(discIndex);
                if (isNoopPatch(current, trimmed)) return;
                room.setDiscProperties(discIndex, trimmed as DiscProps);
            });
            playerDiscProps.forEach((props, playerId) => {
                const trimmed = trimPatch(props);
                if (!trimmed) return;
                const current = room.getPlayerDiscProperties(playerId);
                if (isNoopPatch(current, trimmed)) return;
                room.setPlayerDiscProperties(playerId, trimmed as DiscProps);
            });
            avatars.forEach((avatar, playerId) =>
                room.setAvatar(playerId, avatar),
            );
            teams.forEach((team, playerId) => room.setTeam(playerId, team));
            admins.forEach((admin, playerId) => room.setAdmin(playerId, admin));

            discProps.clear();
            playerDiscProps.clear();
            avatars.clear();
            teams.clear();
            admins.clear();
        },
    };
}

/**
 * API exposed inside $effect closures (executed after the state's run).
 * These helpers bridge state logic to the Room wrapper.
 */
export interface EffectApi extends RoomMethodApi {
    send(
        message: string,
        to?: SendTarget,
        color?: number | null,
        style?: ChatStyle,
        sound?: ChatSoundString,
    ): void;
    send(options: SendOptions): void;
    getTickNumber: () => number;
    CollisionFlags: CFType;
    setPlayerDisc: (playerId: number, props: DiscProps) => void;
    setBall: (props: DiscProps) => void;
}

let RUNTIME: {
    room: Room;
    config: unknown;
    effects: Array<(api: EffectApi) => void>;
    disposals: Array<() => void>;
    transition: Transition | null;
    tickNumber: number;
    mutations: MutationBuffer;
    ownsMutations: boolean;
    stopRequested: boolean;
    beforeGameState: GameState | null;
    muteEffects: boolean;
    globalStore: GlobalStoreApi<any> | null;
    matchEvents: RuntimeMatchEventSink | null;
    checkpointDrafts: Array<CheckpointDraft>;
    resolveCheckpoint:
        | ((args: CheckpointRestoreArgs) => {
              transition: Transition;
              globalStateSnapshot?: unknown;
          })
        | null;
    listCheckpoints: (() => Array<Checkpoint>) | null;
    isPaused: boolean;
    stateStartedTick: number;
    selfStartedTick: number;
    sourceState: string | null;
} | null = null;

const normalizeTransition = (args: {
    to: string;
    params?: any;
    wait?: number;
    disposal?: TransitionDisposal;
}): Transition => {
    const wait =
        typeof args.wait === "number" && args.wait > 0
            ? Math.floor(args.wait)
            : 0;
    const disposal =
        args.disposal === "IMMEDIATE"
            ? "IMMEDIATE"
            : args.disposal === "AFTER_RESUME"
              ? "AFTER_RESUME"
              : "DELAYED";
    const transition: Transition = {
        to: args.to,
        params: args.params ? args.params : {},
        disposal,
    };

    if (wait > 0) {
        transition.wait = wait;
    }

    return transition;
};

/**
 * Install a per-tick runtime.
 */
export function installRuntime(ctx: {
    room: Room;
    config: unknown;
    tickNumber?: number;
    mutations?: MutationBuffer | undefined;
    disposals?: Array<() => void>;
    beforeGameState?: GameState | null;
    muteEffects?: boolean;
    globalStore?: GlobalStoreApi<any> | null;
    matchEvents?: RuntimeMatchEventSink | null;
    checkpointDrafts?: Array<CheckpointDraft>;
    resolveCheckpoint?: (args: CheckpointRestoreArgs) => {
        transition: Transition;
        globalStateSnapshot?: unknown;
    };
    listCheckpoints?: () => Array<Checkpoint>;
    isPaused?: boolean;
    stateStartedTick?: number;
    selfStartedTick?: number;
    sourceState?: string | null;
}) {
    const mutations = ctx.mutations ?? createMutationBuffer(ctx.room);
    const disposals = ctx.disposals ?? [];
    const tickNumber = typeof ctx.tickNumber === "number" ? ctx.tickNumber : 0;
    const stateStartedTick =
        typeof ctx.stateStartedTick === "number"
            ? ctx.stateStartedTick
            : tickNumber;
    const selfStartedTick =
        typeof ctx.selfStartedTick === "number"
            ? ctx.selfStartedTick
            : stateStartedTick;

    RUNTIME = {
        room: ctx.room,
        config: ctx.config,
        effects: [],
        disposals,
        transition: null,
        tickNumber,
        mutations,
        ownsMutations: !ctx.mutations,
        stopRequested: false,
        beforeGameState:
            ctx.beforeGameState === undefined ? null : ctx.beforeGameState,
        muteEffects: !!ctx.muteEffects,
        globalStore: ctx.globalStore ?? null,
        matchEvents: ctx.matchEvents ?? null,
        checkpointDrafts: ctx.checkpointDrafts ?? [],
        resolveCheckpoint: ctx.resolveCheckpoint ?? null,
        listCheckpoints: ctx.listCheckpoints ?? null,
        isPaused: !!ctx.isPaused,
        stateStartedTick,
        selfStartedTick,
        sourceState: ctx.sourceState ?? null,
    };

    return function uninstall() {
        RUNTIME = null;
    };
}

export function $isGamePaused(): boolean {
    if (!RUNTIME) throw new Error("$isGamePaused used outside of runtime");

    return RUNTIME.isPaused;
}

export function $scores(): ReturnType<Room["getScores"]> {
    if (!RUNTIME) throw new Error("$scores used outside of runtime");

    return RUNTIME.room.getScores();
}

/**
 * Allows late replacement of the room reference (no-op if not installed).
 */
export function setRuntimeRoom(room: Room) {
    if (RUNTIME) RUNTIME.room = room;
}

/**
 * Queue an effect to run after the state's run() returns.
 */
export function $effect(fn: (api: EffectApi) => void) {
    if (!RUNTIME) throw new Error("$effect used outside of runtime");

    RUNTIME.effects.push(fn);
}

/**
 * Register an additional disposer to run when the state is cleaned up.
 */
export function $dispose(fn: () => void) {
    if (!RUNTIME) throw new Error("$dispose used outside of runtime");

    RUNTIME.disposals.push(fn);
}

/**
 * Schedule a transition to another state after effects are flushed.
 * Optionally delay the transition by a number of ticks.
 * Throws a sentinel so code after `$next` doesn't run within the tick.
 */
export function $next(args: {
    to: string;
    params?: any;
    wait?: number;
    disposal?: TransitionDisposal;
}): never {
    if (!RUNTIME) throw new Error("$next used outside of runtime");

    RUNTIME.transition = normalizeTransition(args);

    // eslint-disable-next-line no-throw-literal
    throw "__NEXT__";
}

/**
 * Register a checkpoint draft for the current state instance.
 * The engine only commits drafts when this state transitions to a different state.
 */
export function $checkpoint(args: {
    key?: string;
    to: string;
    params?: any;
    wait?: number;
    disposal?: TransitionDisposal;
}): void {
    if (!RUNTIME) throw new Error("$checkpoint used outside of runtime");

    const key =
        typeof args.key === "string" && args.key.trim() !== ""
            ? args.key
            : undefined;

    RUNTIME.checkpointDrafts.push({
        ...(key ? { key } : {}),
        transition: normalizeTransition(args),
    });
}

/**
 * Restore a committed checkpoint by key, or the most recent one.
 * Restore always forces a full state recreation: current state disposes,
 * then checkpoint target state is built from factory scope.
 */
export function $restore(args: CheckpointRestoreArgs = {}): never {
    if (!RUNTIME) throw new Error("$restore used outside of runtime");
    if (!RUNTIME.resolveCheckpoint) {
        throw new Error("$restore used without checkpoint resolver");
    }

    const restoredCheckpoint = RUNTIME.resolveCheckpoint({
        ...(args.key ? { key: args.key } : {}),
        ...(typeof args.consume === "boolean" ? { consume: args.consume } : {}),
    });
    const checkpointTransition = restoredCheckpoint.transition;

    RUNTIME.transition = {
        to: checkpointTransition.to,
        params: checkpointTransition.params,
        disposal: "IMMEDIATE",
        isRestore: true,
        ...(restoredCheckpoint.globalStateSnapshot !== undefined
            ? { globalStateSnapshot: restoredCheckpoint.globalStateSnapshot }
            : {}),
    };

    // eslint-disable-next-line no-throw-literal
    throw "__NEXT__";
}

export function $checkpoints(): Array<Checkpoint> {
    if (!RUNTIME) throw new Error("$checkpoints used outside of runtime");
    if (!RUNTIME.listCheckpoints) {
        throw new Error("$checkpoints used without checkpoint resolver");
    }

    return RUNTIME.listCheckpoints();
}

/**
 * Access strongly-typed config injected when creating the engine.
 */
export function $config<Cfg>(): Cfg {
    if (!RUNTIME) throw new Error("$config used outside of runtime");

    return RUNTIME.config as Cfg;
}

export function $event(event: RuntimeMatchEventInput): void {
    if (!RUNTIME) throw new Error("$event used outside of runtime");
    if (!RUNTIME.sourceState) {
        throw new Error("$event used without a source state");
    }
    if (!RUNTIME.matchEvents) return;

    RUNTIME.matchEvents({
        type: event.type,
        playerId: event.playerId,
        sourceState: RUNTIME.sourceState,
        value: event.value ?? {},
        tick: RUNTIME.tickNumber,
    });
}

export function $global<Schema extends GlobalSchema<any, any>>(
    fn: (state: GlobalStore<Schema>) => void,
): void;
export function $global<
    Schema extends GlobalSchema<any, any>,
>(): GlobalSchemaState<Schema>;
export function $global<Schema extends GlobalSchema<any, any>>(
    fn?: (state: GlobalStore<Schema>) => void,
): GlobalSchemaState<Schema> | void {
    if (!RUNTIME || !RUNTIME.globalStore) {
        throw new Error("$global used without a global store");
    }

    const store = RUNTIME.globalStore as GlobalStoreApi<Schema>;

    if (fn) {
        fn(store.getState() as GlobalStore<Schema>);

        return;
    }

    return store.getState() as GlobalSchemaState<Schema>;
}

export function createGlobalHook<Schema extends GlobalSchema<any, any>>() {
    function useGlobal(fn: (state: GlobalStore<Schema>) => void): void;
    function useGlobal(): GlobalSchemaState<Schema>;
    function useGlobal(
        fn?: (state: GlobalStore<Schema>) => void,
    ): GlobalSchemaState<Schema> | void {
        if (fn) {
            return $global<Schema>(fn);
        }

        return $global<Schema>();
    }

    return useGlobal;
}

/**
 * Access the last GameState snapshot before the current state/tick.
 * Throws if the snapshot is unavailable.
 */
export function $before(): GameState {
    if (!RUNTIME) throw new Error("$before used outside of runtime");
    if (!RUNTIME.beforeGameState) {
        throw new Error("$before GameState is unavailable");
    }

    return RUNTIME.beforeGameState;
}

/**
 * Access the current engine tick number inside factory/run/hook code.
 */
export function $tickNumber(): number {
    if (!RUNTIME) throw new Error("$tickNumber used outside of runtime");

    return RUNTIME.tickNumber;
}

/**
 * Access current tick counters:
 * - now: absolute engine tick.
 * - current: ticks since this state instance started.
 * - self: ticks since entering this state name (persists across self-transitions).
 */
export function $tick(): TickState {
    if (!RUNTIME) throw new Error("$tick used outside of runtime");

    return {
        now: RUNTIME.tickNumber,
        current: RUNTIME.tickNumber - RUNTIME.stateStartedTick,
        self: RUNTIME.tickNumber - RUNTIME.selfStartedTick,
    };
}

/**
 * Execute queued effects and return any pending transition.
 */
export function flushRuntime(): {
    transition: Transition | null;
    stopRequested: boolean;
} {
    if (!RUNTIME) return { transition: null, stopRequested: false };

    const room = RUNTIME.room;
    const cf = room.collisionFlags;
    const mutations = RUNTIME.mutations;

    if (RUNTIME.muteEffects) {
        RUNTIME.effects = [];
        RUNTIME.transition = null;

        return { transition: null, stopRequested: RUNTIME.stopRequested };
    }

    const api = Object.assign(Object.create(room), {
        send: (
            messageOrOpts: string | SendOptions,
            to?: SendTarget,
            color?: number | null,
            style?: ChatStyle,
            sound?: ChatSoundString,
        ) => {
            if (typeof messageOrOpts !== "string") {
                room.send(messageOrOpts);
                return;
            }

            room.send({
                message: messageOrOpts,
                to: to ?? null,
                color: typeof color === "number" ? color : null,
                style: style ?? "normal",
                sound: sound ?? "normal",
            });
        },
        setPlayerDiscProperties: (player: PlayerRef, props: DiscProps) =>
            mutations.queuePlayerDisc(player, props),
        setDiscProperties: (discIndex: number, props: DiscProps) =>
            mutations.queueDisc(discIndex, props),
        setAvatar: (player: PlayerRef, avatar: AvatarValue) =>
            mutations.queueAvatar(player, avatar),
        setTeam: (player: PlayerRef, team: TeamValue) =>
            mutations.queueTeam(player, team),
        setAdmin: (player: PlayerRef, admin: AdminValue) =>
            mutations.queueAdmin(player, admin),
        stopGame: () => {
            RUNTIME!.stopRequested = true;
            room.stopGame();
        },
        getTickNumber: () => RUNTIME!.tickNumber,
        CollisionFlags: cf,
        setPlayerDisc: (playerId: number, props: DiscProps) =>
            mutations.queuePlayerDisc(playerId, props),
        setBall: (props: DiscProps) =>
            mutations.queueDisc(BALL_DEFAULT_INDEX, props),
    }) as EffectApi;

    for (let i = 0; i < RUNTIME.effects.length; i++) {
        const fx = RUNTIME.effects[i];
        if (fx) fx(api);
    }

    if (RUNTIME.ownsMutations) {
        mutations.flush();
    }

    const tr = RUNTIME.transition;
    const stopRequested = RUNTIME.stopRequested;

    RUNTIME.effects = [];
    RUNTIME.transition = null;

    return { transition: tr, stopRequested };
}
