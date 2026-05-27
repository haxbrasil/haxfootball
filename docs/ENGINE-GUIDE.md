# Engine Guide

This guide is for contributors who add new states or game rules; it explains the State API and the core patterns you should follow, without covering engine internals.

## What a State Is

A state is a self-contained phase of gameplay (presnap, live ball, interception, etc.) that owns the rules for that phase and decides when and how to transition to the next state.

## Where State Code Lives

Check the mode registry for the authoritative list of states and their file paths. In this repo, states are currently under `src/modes/classic/states/` and registered in `src/modes/classic/registry.ts`, but future modes can use different directories.

## State API at a Glance

```ts
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { $dispose, $effect, $next } from "@runtime/runtime";

export function MyState({ someParam }: { someParam: number }) {
    // State setup happens when the state is created.
    $effect(($) => {
        $.send("State started");
    });

    // Register cleanup when the state ends.
    $dispose(() => {
        $effect(($) => {
            $.send("State ended");
        });
    });

    function run(state: GameState) {
        // Read-only snapshot: state.players, state.ball, state.tickNumber.
        // Use $next(...) to transition to another state.
        // Use $effect(...) to do side effects.
        // Remember to use $dispose for cleanup.
    }

    return { run };
}
```

## State Lifecycle

- Construction: the state factory runs on entry. Do setup here and register cleanup with `$dispose`.
- Handlers: `run` executes each tick; `join`/`leave`/`chat`/`command` execute on events. All handlers can use hooks.
- Cleanup: when the state ends, all `$dispose` callbacks run; register undo work close to where the change is made so nothing leaks to the next state.

## State Handlers

- `run(state)` (required): per-tick game logic based on the snapshot.
- `join(player)` / `leave(player)` (optional): respond to players entering/leaving.
- `chat(player, message)` (optional): non-command chat messages.
- `command(player, command)` (optional): parsed commands (prefixed messages).

Note: `chat` and `command` run outside the tick loop; they see the last snapshot and should not depend on real-time physics for strict validation.

## Hooks

Hooks are runtime primitives you call inside state handlers; they schedule effects or transitions and are applied by the runtime in a consistent order.

- `$effect(fn)`: queue side effects like announcements, disc updates, and stats.
- `$next(...)`: transition to another state and stop the current handler.
- `$before()`: get the snapshot from before the current state took place.
- `$tick()`: get `{ now, current, self }` tick counters for timing logic.
- `$dispose(fn)`: register cleanup to run when the state ends (can be called during setup or in handlers).
- `$config<T>()`: access the engine configuration object.

Modes can expose additional hooks (for example, game/physics hooks that set LOS lines, ball active state, or traps); use those instead of rewriting low-level disc logic.

Tick counter semantics:

- `now`: absolute engine tick (same value as `$tickNumber()`).
- `current`: ticks since this state instance started.
- `self`: ticks since entering this state name (does not reset on self-transitions).

## Transitions with $next

Use `$next` to move between states and pass parameters:

```ts
$next({
    to: "NEXT_STATE",
    params: {
        /* state params */
    },
    wait: ticks({ seconds: 2 }), // optional delay
});
```

Notes: `$next` stops execution for the current handler, so code after it will not run; place side effects before it or register cleanup via `$dispose`; only call `$next` from state handlers (`run`, `chat`, `command`, etc.), not during state construction or inside `$dispose`.

Same-state transition behavior (`to` equals current state name):

- Default (`disposal` is omitted / `"DELAYED"` / `"AFTER_RESUME"`): the engine re-runs the target state factory with new params and swaps the state API/disposers, but setup effects are muted and current disposers are not executed.
- `"IMMEDIATE"`: the current state is fully disposed and the factory runs normally (setup effects are applied), even if the target state name is the same.

Use this distinction intentionally when deciding whether a self-transition should be a parameter refresh or a full reset.

## Side Effects with $effect

Do side effects inside `$effect` so they are applied in the correct order after state logic finishes:

```ts
$effect(($) => {
    $.send("Message");
    $.setAvatar(playerId, ":)");
});
```

`$effect` is deferred; do not expect changes from `$effect` to be visible in the same handler or the current snapshot.

## GameState Snapshot and $before()

`run(state)` receives a read-only snapshot of players, ball, and the current tick number. If you need the snapshot from before the current state took place (for example, the last tick of the previous state when entering a new state), use `$before()`.

`$before()` can throw if there is no prior snapshot (for example, the very first state before any tick), so guard it when unsure.

`isKickingBall` is a one-tick flag; if you need longer behavior, store it in state params or your own state.

## Common Helpers You Should Use

Use project helpers rather than re-implementing rules or geometry. In this repo they live under `src/modes/classic/shared/` and `src/modes/classic/hooks/`, but future modes may organize them differently. Also use `@common` helpers like `ticks`, `findCatchers`, `findBallCatchers`, and `distributeOnLine`.

## Cleanup Discipline

If you lock the ball, trap players, or set special lines, undo those changes when the state ends by registering cleanup with `$dispose`. This keeps states self-contained and prevents leaks.

## Adding a New State

1. Create the state file in the mode state directory.
2. Export a function that returns the State API.
3. Register it in the mode registry.
4. Transition to it using `$next` from another state.

## Commands vs Chat

Commands are messages with the command prefix (currently `!`) and go to `command`, not `chat`. Return `{ handled: true }` when your state recognizes the command, even if you reject it with a message, and `{ handled: false }` only when the command is not yours so the caller can decide whether to show a fallback message.
