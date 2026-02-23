import {
    installRuntime,
    flushRuntime,
    setRuntimeRoom,
    createMutationBuffer,
    type Checkpoint,
    type MutationBuffer,
    type CheckpointDraft,
    type CheckpointRestoreArgs,
    type Transition,
} from "@runtime/runtime";
import { Room } from "@core/room";
import { Team, type FieldTeam, isFieldTeam } from "@runtime/models";
import { CommandHandleResult, CommandSpec } from "@core/commands";
import {
    createGlobalStore,
    type GlobalSchema,
    type GlobalStoreApi,
} from "@runtime/global";

/**
 * Metas register state factories by string key.
 */
export interface StateApi {
    run: (state: GameState) => void;
    join?: (player: GameStatePlayer) => void;
    leave?: (player: GameStatePlayer) => void;
    chat?: (player: PlayerObject, message: string) => boolean | void;
    command?: (
        player: PlayerObject,
        command: CommandSpec,
    ) => CommandHandleResult | void;
}

export type StateFactory<SParams = any> = (params: SParams) => StateApi;

export type StateRegistry = Record<string, StateFactory<any>>;

export interface EngineOptions<Cfg> {
    config: Cfg;
    globalSchema?: GlobalSchema<any, any>;
}

/**
 * Transient snapshot used by states each tick.
 */
export interface GameStatePlayer {
    id: number;
    name: string;
    team: FieldTeam;
    x: number;
    y: number;
    radius: number;
    isKickingBall: boolean;
}

export interface GameStateBall {
    x: number;
    y: number;
    radius: number;
    xspeed: number;
    yspeed: number;
}

export interface GameState {
    players: GameStatePlayer[];
    ball: GameStateBall;
    tickNumber: number;
}

export type ChatHandleResult = {
    allowBroadcast: boolean;
    sentBeforeHooks: boolean;
};

export interface Engine<Cfg = unknown> {
    start: (name: string, params?: any) => void;
    stop: () => void;
    tick: () => void;
    handleGamePause: (byPlayer: PlayerObject | null) => void;
    handleGameUnpause: (byPlayer: PlayerObject | null) => void;
    trackPlayerBallKick: (playerId: number) => void;
    handlePlayerChat: (
        player: PlayerObject,
        message: string,
        onBeforeHooks?: () => void,
    ) => ChatHandleResult;
    handlePlayerCommand: (
        player: PlayerObject,
        command: CommandSpec,
    ) => CommandHandleResult;
    handlePlayerTeamChange: (
        player: PlayerObject,
        byPlayer: PlayerObject | null,
    ) => void;
    handlePlayerLeave: (player: PlayerObject) => void;
    getGlobalStateSnapshot: <State = unknown>() => State | null;
    isRunning: () => boolean;
    readonly _configBrand?: Cfg;
}

type StateInstance = {
    name: string;
    api: StateApi;
    disposals: Array<() => void>;
    checkpointDrafts: Array<CheckpointDraft>;
    stateStartedTick: number;
    selfStartedTick: number;
};

type DelayedTransition = {
    to: string;
    params: any;
    remainingTicks: number;
    disposal: "IMMEDIATE" | "DELAYED" | "AFTER_RESUME";
    isRestore?: boolean;
    globalStateSnapshot?: unknown;
};

type CommittedCheckpoint = Checkpoint & {
    globalStateSnapshot?: unknown;
};

type PendingCheckpointDrafts = {
    sourceState: string;
    drafts: Array<CheckpointDraft>;
};

const CHECKPOINT_LIMIT = 50;

const cloneTransitionParams = (params: any): any => {
    if (Array.isArray(params)) {
        return [...params];
    }

    if (params && typeof params === "object") {
        return { ...params };
    }

    return params;
};

const cloneTransition = (transition: Transition): Transition => ({
    to: transition.to,
    params: cloneTransitionParams(transition.params),
    ...(typeof transition.wait === "number" ? { wait: transition.wait } : {}),
    ...(transition.disposal ? { disposal: transition.disposal } : {}),
    ...(transition.isRestore ? { isRestore: true } : {}),
    ...(transition.globalStateSnapshot !== undefined
        ? { globalStateSnapshot: transition.globalStateSnapshot }
        : {}),
});

const cloneGlobalStateSnapshot = (snapshot: unknown): unknown => {
    try {
        if (typeof globalThis.structuredClone === "function") {
            return globalThis.structuredClone(snapshot);
        }
    } catch {
        // Fall through to JSON clone.
    }

    return JSON.parse(JSON.stringify(snapshot));
};

function getBallSnapshot(room: Room): GameStateBall {
    const ballPos = room.getBallPosition();
    const disc = room.getDiscProperties(0);

    const radius = disc && typeof disc.radius === "number" ? disc.radius : 0;
    const xspeed = disc && typeof disc.xspeed === "number" ? disc.xspeed : 0;
    const yspeed = disc && typeof disc.yspeed === "number" ? disc.yspeed : 0;

    return {
        x: ballPos ? ballPos.x : 0,
        y: ballPos ? ballPos.y : 0,
        radius,
        xspeed,
        yspeed,
    };
}

function createGameStatePlayerSnapshot(
    room: Room,
    player: PlayerObject,
    kickerIds: Set<number>,
): GameStatePlayer | null {
    if (!isFieldTeam(player.team)) return null;

    const disc = room.getPlayerDiscProperties(player.id);
    const { x: px, y: py } = resolvePlayerPosition(player, disc);
    const radius = disc && typeof disc.radius === "number" ? disc.radius : 0;
    const team: FieldTeam = player.team === Team.RED ? Team.RED : Team.BLUE;

    return {
        id: player.id,
        name: player.name,
        team,
        x: px,
        y: py,
        radius,
        isKickingBall: kickerIds.has(player.id),
    };
}

function resolvePlayerPosition(
    player: PlayerObject,
    disc: DiscPropertiesObject | null,
): { x: number; y: number } {
    if (disc && typeof disc.x === "number" && typeof disc.y === "number") {
        return { x: disc.x, y: disc.y };
    }

    if (
        player.position &&
        typeof player.position.x === "number" &&
        typeof player.position.y === "number"
    ) {
        return { x: player.position.x, y: player.position.y };
    }

    throw new Error(`Missing position for player ${player.id}`);
}

function buildGameState(
    room: Room,
    kickerIds: Set<number>,
    tickNumber: number,
): GameState {
    const list = room.getPlayerList();
    const ball = getBallSnapshot(room);

    const players = list
        .map((p) => createGameStatePlayerSnapshot(room, p, kickerIds))
        .filter((p): p is GameStatePlayer => p !== null);

    return { players, ball, tickNumber };
}

/**
 * Creates a new engine bound to a Room wrapper.
 * The module drives it exclusively via Module event callbacks.
 */
export function createEngine<Cfg>(
    room: Room,
    registry: StateRegistry,
    opts: EngineOptions<Cfg>,
): Engine<Cfg> {
    let current: StateInstance | null = null;
    let pendingTransition: Transition | null = null;
    let delayedTransition: DelayedTransition | null = null;
    let kickerSet: Set<number> = new Set();
    let running = false;
    let disableStateExecution = false;
    let tickNumber = 0;
    let sharedTickMutations: MutationBuffer | null = null;
    let lastGameState: GameState | null = null;
    let isPaused = false;
    let resumePending = false;
    let isResumeTick = false;
    let afterResumeDisposers: Array<() => void> = [];
    let afterResumeTransition: Transition | null = null;
    let checkpoints: Array<CommittedCheckpoint> = [];
    let pendingCheckpointDrafts: PendingCheckpointDrafts | null = null;
    const globalSchema = opts.globalSchema;
    let globalStore: GlobalStoreApi<any> | null = null;

    const resetGlobalStore = () => {
        globalStore = globalSchema ? createGlobalStore(globalSchema) : null;
    };

    function commitCheckpointDrafts(
        sourceState: string,
        drafts: Array<CheckpointDraft>,
    ) {
        if (drafts.length === 0) return;

        const globalStateSnapshot = globalStore
            ? cloneGlobalStateSnapshot(globalStore.getStateSnapshot())
            : undefined;

        const committed = drafts.map((draft) => ({
            ...(draft.key ? { key: draft.key } : {}),
            sourceState,
            tickNumber,
            transition: cloneTransition(draft.transition),
            ...(globalStateSnapshot !== undefined
                ? {
                      globalStateSnapshot:
                          cloneGlobalStateSnapshot(globalStateSnapshot),
                  }
                : {}),
        }));

        checkpoints = [...checkpoints, ...committed];
        if (checkpoints.length > CHECKPOINT_LIMIT) {
            checkpoints = checkpoints.slice(
                checkpoints.length - CHECKPOINT_LIMIT,
            );
        }
    }

    function commitStateCheckpointDrafts(target: StateInstance) {
        if (target.checkpointDrafts.length === 0) return;

        commitCheckpointDrafts(target.name, target.checkpointDrafts);
        target.checkpointDrafts.length = 0;
    }

    function detachStateCheckpointDrafts(
        target: StateInstance,
    ): PendingCheckpointDrafts | null {
        if (target.checkpointDrafts.length === 0) return null;

        const drafts = target.checkpointDrafts.map((draft) => ({
            ...(draft.key ? { key: draft.key } : {}),
            transition: cloneTransition(draft.transition),
        }));

        target.checkpointDrafts.length = 0;

        return {
            sourceState: target.name,
            drafts,
        };
    }

    function resolveCheckpoint(args: CheckpointRestoreArgs): {
        transition: Transition;
        globalStateSnapshot?: unknown;
    } {
        const consume = args.consume ?? true;
        const normalizedKey =
            typeof args.key === "string" && args.key.trim() !== ""
                ? args.key
                : null;
        const index = (() => {
            if (!normalizedKey) {
                return checkpoints.length - 1;
            }

            for (let i = checkpoints.length - 1; i >= 0; i -= 1) {
                const checkpoint = checkpoints[i];
                if (checkpoint && checkpoint.key === normalizedKey) {
                    return i;
                }
            }

            return -1;
        })();

        if (index < 0) {
            if (normalizedKey) {
                throw new Error(`Checkpoint "${normalizedKey}" was not found`);
            }

            throw new Error("No checkpoints are available");
        }

        const checkpoint = checkpoints[index];

        if (!checkpoint) {
            throw new Error("Checkpoint lookup failed");
        }

        if (consume) {
            checkpoints.splice(index, 1);
        }

        return {
            transition: cloneTransition(checkpoint.transition),
            ...(checkpoint.globalStateSnapshot !== undefined
                ? {
                      globalStateSnapshot: cloneGlobalStateSnapshot(
                          checkpoint.globalStateSnapshot,
                      ),
                  }
                : {}),
        };
    }

    function listCheckpoints(): Array<Checkpoint> {
        return checkpoints.map((checkpoint) => ({
            ...(checkpoint.key ? { key: checkpoint.key } : {}),
            sourceState: checkpoint.sourceState,
            tickNumber: checkpoint.tickNumber,
            transition: cloneTransition(checkpoint.transition),
        }));
    }

    function runOutsideTick<T>(
        fn: () => T,
        optsRun?: {
            allowTransition?: boolean;
            disposals?: Array<() => void>;
            checkpointDrafts?: Array<CheckpointDraft>;
            beforeGameState?: GameState | null;
            muteEffects?: boolean;
            mutations?: MutationBuffer;
            stateStartedTick?: number;
            selfStartedTick?: number;
        },
    ): T {
        room.invalidateCaches();
        const stateStartedTick =
            typeof optsRun?.stateStartedTick === "number"
                ? optsRun.stateStartedTick
                : (current?.stateStartedTick ?? tickNumber);
        const selfStartedTick =
            typeof optsRun?.selfStartedTick === "number"
                ? optsRun.selfStartedTick
                : (current?.selfStartedTick ?? stateStartedTick);
        const uninstall = installRuntime({
            room,
            config: opts.config,
            tickNumber,
            mutations: optsRun?.mutations ?? sharedTickMutations ?? undefined,
            globalStore,
            isPaused,
            ...(optsRun?.disposals ? { disposals: optsRun.disposals } : {}),
            ...(optsRun?.checkpointDrafts
                ? { checkpointDrafts: optsRun.checkpointDrafts }
                : {}),
            beforeGameState:
                optsRun && "beforeGameState" in optsRun
                    ? optsRun.beforeGameState
                    : lastGameState,
            ...(optsRun?.muteEffects !== undefined
                ? { muteEffects: optsRun.muteEffects }
                : {}),
            resolveCheckpoint,
            listCheckpoints,
            stateStartedTick,
            selfStartedTick,
        });

        setRuntimeRoom(room);

        const allowTransition = optsRun?.allowTransition ?? false;
        let result!: T;
        try {
            result = fn();
        } catch (err) {
            if (err === "__NEXT__" && allowTransition) {
                result = undefined as T;
            } else {
                throw err;
            }
        } finally {
            const flushed = flushRuntime();

            uninstall();

            if (!allowTransition && flushed.transition) {
                throw new Error(
                    "$next cannot be used during state setup/cleanup",
                );
            }

            if (flushed.stopRequested) {
                pendingTransition = null;
                delayedTransition = null;
                disableStateExecution = true;
                running = false;
            } else if (allowTransition && flushed.transition) {
                scheduleTransition(flushed.transition);
            }
        }

        return result;
    }

    function ensureFactory(name: string) {
        const factory = registry[name];

        if (!factory) throw new Error(`State "${name}" is not registered`);

        return factory;
    }

    function createState(
        name: string,
        params?: any,
        factory?: StateFactory<any>,
        options?: {
            muteEffects?: boolean;
            mutations?: MutationBuffer;
            stateStartedTick?: number;
            selfStartedTick?: number;
        },
    ): Omit<StateInstance, "name"> {
        const resolved = factory ?? ensureFactory(name);

        const disposals: Array<() => void> = [];
        const checkpointDrafts: Array<CheckpointDraft> = [];
        const stateStartedTick =
            typeof options?.stateStartedTick === "number"
                ? options.stateStartedTick
                : tickNumber;
        const selfStartedTick =
            typeof options?.selfStartedTick === "number"
                ? options.selfStartedTick
                : stateStartedTick;

        const api = runOutsideTick(() => resolved(params ?? {}), {
            disposals,
            checkpointDrafts,
            beforeGameState: lastGameState,
            stateStartedTick,
            selfStartedTick,
            ...(options?.muteEffects !== undefined
                ? { muteEffects: options.muteEffects }
                : {}),
            ...(options?.mutations ? { mutations: options.mutations } : {}),
        });

        return {
            api,
            disposals,
            checkpointDrafts,
            stateStartedTick,
            selfStartedTick,
        };
    }

    function collectDisposers(target: StateInstance | null): Array<() => void> {
        if (!target) return [];

        const disposeFns: Array<() => void> = [];

        disposeFns.push(...target.disposals);
        target.disposals.length = 0;

        return disposeFns;
    }

    function runDisposers(
        disposeFns: Array<() => void>,
        mutations?: MutationBuffer,
    ) {
        if (disposeFns.length === 0) return;

        const runtimeDisposals: Array<() => void> = [];

        runOutsideTick(
            () => {
                for (const fn of disposeFns) {
                    fn();
                }
                runtimeDisposals.length = 0;
            },
            {
                disposals: runtimeDisposals,
                beforeGameState: lastGameState,
                ...(mutations ? { mutations } : {}),
            },
        );
    }

    function flushAfterResumeDisposers() {
        if (afterResumeDisposers.length === 0) return;
        const disposers = afterResumeDisposers;
        afterResumeDisposers = [];
        runDisposers(disposers);
    }

    function queueAfterResumeDisposers(disposeFns: Array<() => void>) {
        if (disposeFns.length === 0) return;
        afterResumeDisposers.push(...disposeFns);
    }

    function disposeState(
        target: StateInstance | null,
        mutations?: MutationBuffer,
    ) {
        const disposeFns = collectDisposers(target);
        runDisposers(disposeFns, mutations);
    }

    function deferDisposeState(target: StateInstance | null) {
        const disposeFns = collectDisposers(target);
        queueAfterResumeDisposers(disposeFns);
    }

    function applyTransition() {
        if (!pendingTransition) return;
        const next = pendingTransition;
        const previous = current;
        const isRestoreTransition = next.isRestore === true;
        pendingTransition = null;

        const isSameState = previous && previous.name === next.to;

        if (previous && isSameState && next.disposal !== "IMMEDIATE") {
            const factory = ensureFactory(next.to);
            const created = createState(next.to, next.params, factory, {
                muteEffects: true,
                stateStartedTick: tickNumber,
                selfStartedTick: previous.selfStartedTick,
            });

            previous.api = created.api;
            previous.disposals = created.disposals;
            previous.checkpointDrafts = created.checkpointDrafts;
            previous.stateStartedTick = created.stateStartedTick;
            previous.selfStartedTick = created.selfStartedTick;
            return;
        }

        const factory = ensureFactory(next.to);
        if (
            isRestoreTransition &&
            globalStore &&
            next.globalStateSnapshot !== undefined
        ) {
            globalStore.setStateSnapshot(next.globalStateSnapshot as any);
        }

        const transitionMutations =
            previous && next.disposal !== "AFTER_RESUME"
                ? createMutationBuffer(room)
                : null;

        if (next.disposal === "AFTER_RESUME") {
            deferDisposeState(previous);
        } else {
            disposeState(previous, transitionMutations ?? undefined);
        }

        const created = createState(next.to, next.params, factory, {
            stateStartedTick: tickNumber,
            selfStartedTick:
                previous && previous.name === next.to
                    ? previous.selfStartedTick
                    : tickNumber,
            ...(transitionMutations ? { mutations: transitionMutations } : {}),
        });

        current = {
            name: next.to,
            api: created.api,
            disposals: created.disposals,
            checkpointDrafts: created.checkpointDrafts,
            stateStartedTick: created.stateStartedTick,
            selfStartedTick: created.selfStartedTick,
        };

        if (!isRestoreTransition && previous && previous.name !== next.to) {
            commitStateCheckpointDrafts(previous);
        }
        if (
            !isRestoreTransition &&
            pendingCheckpointDrafts &&
            pendingCheckpointDrafts.sourceState !== next.to
        ) {
            commitCheckpointDrafts(
                pendingCheckpointDrafts.sourceState,
                pendingCheckpointDrafts.drafts,
            );
        }
        pendingCheckpointDrafts = null;

        if (transitionMutations) {
            transitionMutations.flush();
        }
    }

    function scheduleTransition(transition: Transition) {
        // Any newly scheduled transition supersedes queued deferred transitions.
        delayedTransition = null;
        afterResumeTransition = null;

        const wait =
            typeof transition.wait === "number" && transition.wait > 0
                ? transition.wait
                : 0;
        const disposal =
            transition.disposal === "IMMEDIATE"
                ? "IMMEDIATE"
                : transition.disposal === "AFTER_RESUME"
                  ? "AFTER_RESUME"
                  : "DELAYED";

        if (disposal === "AFTER_RESUME" && wait === 0 && isResumeTick) {
            pendingTransition = { ...transition, disposal: "DELAYED" };
            applyTransition();
            return;
        }

        if (wait > 0) {
            delayedTransition = {
                to: transition.to,
                params: transition.params,
                remainingTicks: wait,
                disposal,
                ...(transition.isRestore ? { isRestore: true } : {}),
                ...(transition.globalStateSnapshot !== undefined
                    ? {
                          globalStateSnapshot: transition.globalStateSnapshot,
                      }
                    : {}),
            };

            if (disposal === "IMMEDIATE") {
                if (current && current.name !== transition.to) {
                    pendingCheckpointDrafts =
                        detachStateCheckpointDrafts(current);
                } else {
                    pendingCheckpointDrafts = null;
                }
                disposeState(current);
                current = null;
            }
            pendingTransition = null;
            return;
        }

        if (disposal === "AFTER_RESUME") {
            afterResumeTransition = transition;
            return;
        }

        pendingTransition = transition;
        applyTransition();
    }

    function start(name: string, params?: any) {
        if (running) stop();

        const factory = ensureFactory(name);

        tickNumber = 0;
        disableStateExecution = false;
        pendingTransition = null;
        delayedTransition = null;
        lastGameState = null;
        afterResumeDisposers = [];
        resumePending = false;
        isPaused = false;
        isResumeTick = false;
        afterResumeTransition = null;
        checkpoints = [];
        pendingCheckpointDrafts = null;
        resetGlobalStore();

        const created = createState(name, params, factory);

        current = {
            name,
            api: created.api,
            disposals: created.disposals,
            checkpointDrafts: created.checkpointDrafts,
            stateStartedTick: created.stateStartedTick,
            selfStartedTick: created.selfStartedTick,
        };

        running = true;
    }

    function stop() {
        disposeState(current);
        flushAfterResumeDisposers();

        current = null;
        running = false;
        kickerSet.clear();
        tickNumber = 0;
        disableStateExecution = false;
        pendingTransition = null;
        delayedTransition = null;
        lastGameState = null;
        afterResumeDisposers = [];
        resumePending = false;
        isPaused = false;
        isResumeTick = false;
        afterResumeTransition = null;
        checkpoints = [];
        pendingCheckpointDrafts = null;
    }

    function tick() {
        if (!running || disableStateExecution) return;

        isResumeTick = resumePending;
        if (resumePending) {
            resumePending = false;
            flushAfterResumeDisposers();
            if (afterResumeTransition) {
                pendingTransition = {
                    ...afterResumeTransition,
                    disposal: "DELAYED",
                };
                afterResumeTransition = null;
                applyTransition();
            }
        }

        const kicksThisTick = delayedTransition ? new Set<number>() : kickerSet;
        kickerSet = new Set();

        if (delayedTransition) {
            if (delayedTransition.remainingTicks > 0) {
                delayedTransition.remainingTicks -= 1;
                tickNumber += 1;
                isResumeTick = false;
                return;
            }

            const completedTransition = {
                to: delayedTransition.to,
                params: delayedTransition.params,
                disposal: delayedTransition.disposal,
                ...(delayedTransition.isRestore
                    ? { isRestore: true as const }
                    : {}),
                ...(delayedTransition.globalStateSnapshot !== undefined
                    ? {
                          globalStateSnapshot:
                              delayedTransition.globalStateSnapshot,
                      }
                    : {}),
            };
            delayedTransition = null;
            if (completedTransition.disposal === "AFTER_RESUME") {
                if (isResumeTick) {
                    pendingTransition = {
                        ...completedTransition,
                        disposal: "DELAYED",
                    };
                    applyTransition();
                } else {
                    afterResumeTransition = completedTransition;
                }
            } else {
                pendingTransition = completedTransition;
                applyTransition();
            }
        }

        if (afterResumeTransition && !isResumeTick) {
            tickNumber += 1;
            isResumeTick = false;
            return;
        }

        if (!current) {
            tickNumber += 1;
            isResumeTick = false;
            return;
        }

        room.invalidateCaches();
        sharedTickMutations = createMutationBuffer(room);

        try {
            const currentTickNumber = tickNumber;

            const uninstall = installRuntime({
                room,
                config: opts.config,
                tickNumber: currentTickNumber,
                mutations: sharedTickMutations ?? undefined,
                globalStore,
                disposals: current.disposals,
                checkpointDrafts: current.checkpointDrafts,
                beforeGameState: lastGameState,
                resolveCheckpoint,
                listCheckpoints,
                isPaused,
                stateStartedTick: current.stateStartedTick,
                selfStartedTick: current.selfStartedTick,
            });

            setRuntimeRoom(room);

            // Build state, consume the "kicker" one-tick flag.
            const gs = buildGameState(room, kicksThisTick, currentTickNumber);

            let flushed: {
                transition: Transition | null;
                stopRequested: boolean;
            } | null = null;

            try {
                // Run state logic; `$next` throws a sentinel to halt local flow.
                try {
                    current.api.run(gs);
                } catch (err) {
                    if (err !== "__NEXT__") throw err;
                }

                // Flush $effects and apply transition if any.
                flushed = flushRuntime();
            } finally {
                uninstall();
            }

            if (flushed?.stopRequested) {
                pendingTransition = null;
                delayedTransition = null;
                disableStateExecution = true;
                running = false;
            } else if (flushed && flushed.transition) {
                scheduleTransition(flushed.transition);
            }

            lastGameState = gs;
            tickNumber += 1;
        } finally {
            isResumeTick = false;
            if (sharedTickMutations) {
                sharedTickMutations.flush();
                sharedTickMutations = null;
            }
        }
    }

    function trackPlayerBallKick(playerId: number) {
        kickerSet.add(playerId);
    }

    function handleGamePause(_byPlayer: PlayerObject | null) {
        isPaused = true;
        resumePending = false;
    }

    function handleGameUnpause(_byPlayer: PlayerObject | null) {
        isPaused = false;
        resumePending = true;
    }

    function handlePlayerChat(
        player: PlayerObject,
        message: string,
        onBeforeHooks?: () => void,
    ): ChatHandleResult {
        if (!running || !current || !current.api.chat || isPaused) {
            onBeforeHooks?.();
            return {
                allowBroadcast: true,
                sentBeforeHooks: !!onBeforeHooks,
            };
        }

        let sentBeforeHooks = false;

        const chatResult = runOutsideTick(
            () => {
                try {
                    const result = current!.api.chat!(player, message);

                    if (result !== false && onBeforeHooks) {
                        onBeforeHooks();
                        sentBeforeHooks = true;
                    }

                    return result;
                } catch (err) {
                    if (err === "__NEXT__" && onBeforeHooks) {
                        onBeforeHooks();
                        sentBeforeHooks = true;
                    }

                    throw err;
                }
            },
            {
                allowTransition: true,
                disposals: current.disposals,
                checkpointDrafts: current.checkpointDrafts,
                beforeGameState: lastGameState,
            },
        );

        const allowBroadcast = chatResult !== false;

        return {
            allowBroadcast,
            sentBeforeHooks,
        };
    }

    function handlePlayerCommand(
        player: PlayerObject,
        command: CommandSpec,
    ): CommandHandleResult {
        if (!running || !current || !current.api.command) {
            return { handled: false };
        }

        const commandResult = runOutsideTick(
            () => {
                const handlerResult = current!.api.command!(player, command);

                return handlerResult ?? { handled: false };
            },
            {
                allowTransition: true,
                disposals: current.disposals,
                checkpointDrafts: current.checkpointDrafts,
                beforeGameState: lastGameState,
            },
        );

        return commandResult ?? { handled: true };
    }

    function handlePlayerTeamChange(
        player: PlayerObject,
        _byPlayer: PlayerObject | null,
    ) {
        if (!running || !current || !current.api.join) return;

        const snapshot = createGameStatePlayerSnapshot(room, player, kickerSet);
        if (!snapshot) return;

        runOutsideTick(
            () => {
                current!.api.join!(snapshot);
            },
            {
                disposals: current.disposals,
                checkpointDrafts: current.checkpointDrafts,
                beforeGameState: lastGameState,
            },
        );
    }

    function handlePlayerLeave(player: PlayerObject) {
        if (!running || !current || !current.api.leave) return;

        const snapshot = createGameStatePlayerSnapshot(room, player, kickerSet);
        if (!snapshot) return;

        runOutsideTick(
            () => {
                current!.api.leave!(snapshot);
            },
            {
                allowTransition: true,
                disposals: current.disposals,
                checkpointDrafts: current.checkpointDrafts,
                beforeGameState: lastGameState,
            },
        );
    }

    function isRunning() {
        return running;
    }

    function getGlobalStateSnapshot<State = unknown>(): State | null {
        if (!globalStore) return null;

        return globalStore.getStateSnapshot() as State;
    }

    return {
        start,
        stop,
        tick,
        handleGamePause,
        handleGameUnpause,
        trackPlayerBallKick,
        handlePlayerChat,
        handlePlayerCommand,
        handlePlayerTeamChange,
        handlePlayerLeave,
        getGlobalStateSnapshot,
        isRunning,
    };
}
