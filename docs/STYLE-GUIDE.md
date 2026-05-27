# Style Guide

This guide captures the local conventions and "dos and don'ts" used across this codebase. Use it alongside `docs/ENGINE-GUIDE.md` when adding or refactoring gameplay states.

## Principles

- Prefer readability over cleverness; make state flows easy to scan.
- Favor pure helpers and immutable updates; avoid hidden side effects.
- Be explicit in naming and intent; the next reader should not need to infer behavior.
- Reuse shared helpers from `@common` and `@modes/classic/shared` instead of duplicating logic.
- Keep rule ordering deterministic; penalties and hard-stops should run before lower-priority rules.

## State Organization (Handlers Style)

For complex states, organize logic as a frame builder + focused handlers, similar to `snap.ts`.

Do:

- Build a `Frame` object from the snapshot and reuse it.
- Return `null` from the frame builder if required actors are missing.
- Keep frame fields derived and read-only.
- Use small `$handle...` functions for each rule.
- Name handlers by intent (`$handleOutOfBounds`, `$handleTouchdown`).
- Keep `run` as a simple orchestration step.

Don't:

- Interleave unrelated rule checks in one long `run` body.
- Recompute the same derived values across handlers.
- Spread team filters and LOS checks across many handlers; compute once in the frame.

## Hooks and Runtime

Do:

- Use `$effect` for side effects (messages, avatars, disc changes).
- Use `$next` to transition; it ends the handler.
- Register cleanup with `$dispose` near the effect you need to undo.
- Call `$before()` directly when you know a snapshot exists.
- Keep durations as named constants and compute them via `ticks`.
- For same-state `$next`, use `disposal: "IMMEDIATE"` when you need full teardown/setup; default self-transitions only refresh params/API and do not run disposal.

Don't:

- Add `return` statements after `$next` (it already stops execution).
- Call `$next` from inside `$dispose` or state construction.
- Wrap `$before()` in `try/catch` or IIFEs.
- Assume `$effect` changes are visible in the current snapshot.

## Handler Ordering

Do:

- Place hard-stop rules (touchdowns, penalties, illegal touches) before standard flow rules.
- Keep handler order consistent across states so reasoning stays predictable.

Don't:

- Allow multiple potential transitions to compete in one tick.

## Messaging and i18n

Do:

- Put message string literals inside `$.send(...)`.
- Use `t\`...\`` for localization and interpolate values.
- Use `formatNames(...)` for player lists.
- Use `cn(...)` when a message depends on `downState`.
- Pair messages with `$.stat(...)` when a discrete event happens.

Don't:

- Prebuild message strings in variables just to pass into `send`.
- Hardcode numbers inside message strings; interpolate them instead.
- Construct name lists with manual `.map(...).join(...)`.

## Data and Types

Do:

- Use `GameStatePlayer` / `GameStateBall` types where possible.
- Prefer `FieldTeam` and `opposite(...)` over raw team numbers.
- Update down state via helpers like `advanceDownState`, `withLastBallY`, and `withLastBallYAtCenter`.
- Use explicit frame types (`SnapFrame`, `FieldGoalFrame`) for derived data.

Don't:

- Re-implement field/goal geometry when helpers exist.
- Check array length if it is guaranteed to be > 0 by construction.
- Thread cross-state data through globals when it belongs in `DownState`.

## Field Geometry and Math

Do:

- Use helpers like `calculateDirectionalGain`, `getPositionFromFieldPosition`, and `clampToHashCenterY`.
- Use `getBallPath`, `intersectsGoalPosts`, and `isOutOfBounds` instead of raw coordinate math.
- Use `distributeOnLine`, `verticalLine`, `sortBy`, and `findClosest` for formations.

Don't:

- Hardcode field coordinates or goal line positions in states.

## Ball and Player Control

Do:

- Use hooks for physics and game state: `$lockBall`, `$unlockBall`, `$setBallActive`, `$setBallInactive`.
- Zero `xspeed`/`yspeed` when placing players into formations.
- Undo temporary avatars or disc changes in `$dispose`.

Don't:

- Mutate physics directly when a hook exists.
- Leave avatars or locked balls active after the state ends.

## Down State and Penalties

Do:

- Use `applyOffensivePenalty` / `applyDefensivePenalty` and their `process...` helpers.
- Use `getInitialDownState` for resets and ensure `lastBallY` is preserved or reset explicitly.

Don't:

- Manually adjust downs, distance, or possession without the helpers.

## Commands and Chat

Do:

- Return `{ handled: true }` for recognized commands even if denied.
- Keep `chat` logic lightweight and deterministic.

Don't:

- Depend on real-time physics in `chat` / `command`; they run outside tick.

## Mutability and Style

Do:

- Prefer `const` and immutable data transforms.
- Extract helpers instead of using IIFEs.
- Keep state constructors small; move derived logic into helpers.

Don't:

- Use `let` or mutate objects/arrays in place unless absolutely necessary.
- Use exception-based control flow for normal gameplay rules.

## Performance Hygiene

Do:

- Filter players by team once per tick and reuse those arrays.
- Cache computed values (LOS X, directional gain, ball path) in the frame.

Don't:

- Recompute expensive geometry in multiple handlers in the same tick.
