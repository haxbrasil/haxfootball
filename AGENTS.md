# AGENTS.md

This file is for coding agents working in the `haxfootball` room package repository. It applies to the whole repo.

## Project Snapshot

`haxfootball` is a HaxBall headless room package for an American-football game mode. It builds a Node room entrypoint, opens a HaxBall room, wires room events into modules, and drives gameplay through a tick-based state engine.

The package manager is pnpm. Do not introduce `package-lock.json`, do not use `npm version`, and do not switch scripts or docs to npm for development. The release artifact is still verified against npm install because the production API currently installs room packages with npm.

## Common Commands

Use these from the repo root:

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm test -- --run
pnpm run build
pnpm run i18n
pnpm run format:ci
pnpm run lint
```

Run a room in dev mode with:

```sh
LANGUAGE=pt-BR DEBUG=true TOKEN="<haxball-token>" pnpm run dev:node
```

`TOKEN` is required by the dev `src/environments/node.ts` entrypoint. Optional room-module environment variables include `PROXY`, `DEBUG`, `LANGUAGE`, `TUTORIAL_LINK`, and `DISCORD_LINK`. Environment schemas live in `src/env/room.ts`, `src/env/node.ts`, and `src/env/room-server.ts`; shared validation helpers live under `src/env/validator/`.

## Repository Layout

`src/environments/node.ts` is the dev/manual room bootstrap. It initializes i18n, loads the agnostic `@room/manual` mode, opens the room through `@haxball/game`, and installs modules.

`src/environments/room-server.ts` is the production/API bootstrap. It loads the SDK-backed `@room/managed` mode, reads the room-server environment, opens a room, installs modules, and reports readiness to the API when readiness credentials are available. The API still discovers room links from room logs.

`src/haxball/game.ts` implements room creation and the public headless room API. Keep the public `HBInit`/`RoomObject` shape stable here.

`src/haxball/headless.ts` declares the global Headless Host types. When exposing a room capability, add explicit named methods and explicit types here. Avoid shortcut type hacks that hide an incorrect public surface.

`src/core/room.ts` is the higher-level room facade used by modules and runtime effects. Modules should call this facade instead of reaching into raw room internals.

`src/core/module.ts` defines the module event API, command routing, command buffering, stadium undo behavior, and callback wiring.

`src/runtime/*` implements the state engine and hooks. State code should interact through runtime hooks and `Room` effects rather than direct room mutation.

`src/modes/classic/*` contains the current football game mode: config, hooks, shared rules, state registry, states, and stadium. The authoritative state list is `src/modes/classic/registry.ts`. Classic states are grouped by football phase under `src/modes/classic/states/scrimmage`, `src/modes/classic/states/kicking`, `src/modes/classic/states/extra-point`, and `src/modes/classic/states/trick`.

Classic shared code is grouped by domain under `src/modes/classic/shared/`: `rules` for football rule primitives, `interaction` for player/ball interaction detectors and evaluators, `field` for field geometry and special discs, `formation` for positioning, `presentation` for message formatting, and `commands` for command plumbing. Root-level shared files should generally be barrels or compatibility entrypoints, not new implementation modules.

Classic mode-level definition code lives under `src/modes/classic/definition/`. Keep command metadata, flag parsing, end-game control, and the final mode definition in separate files there instead of recreating a broad `definition.ts`.

`src/common/*` contains reusable game, geometry, stadium-builder, stadium-generator, and general helpers. Prefer these over duplicating geometry or physics logic in states.

`src/room/manual/*` defines the agnostic room mode. It must not depend on the HaxFootball API SDK.

`src/room/managed/*` defines the API-managed room mode. SDK-backed account/session behavior belongs here.

`src/room/shared/domain/*` contains generic room config, command categories, session stores, and authorization concepts shared by room modes.

`src/room/shared/modules/*` contains reusable room modules shared by room modes.

`docs/ENGINE-GUIDE.md` and `docs/STYLE-GUIDE.md` are required reading before changing gameplay states. `docs/headless/*` documents the public headless/stadium API and should stay standalone for users.

## Required Docs Reading

Before doing any game-rules work, read the `docs/` folder for the current project guidance. This includes at least `docs/ENGINE-GUIDE.md`, `docs/STYLE-GUIDE.md`, and the relevant `docs/headless/*` files when the change touches stadiums, collision flags, physics, room APIs, or headless behavior.

Do this before editing gameplay states, shared rule helpers, runtime hooks used by states, stadium generation, commands that affect gameplay, or anything under `src/modes/classic`.

## Modules and Commands

Modules are created with `createModule()` and composed by the room mode entrypoints under `src/room/manual/index.ts` and `src/room/managed/index.ts`. Multiple modules can subscribe to the same room event.

All command configs must use the same prefix, currently `COMMAND_PREFIX` from `src/core/commands.ts` (`!`). Command names and aliases are normalized to lowercase.

Command handlers should return `{ hideMessage: true }` when the command should not be echoed to room chat. Return handled/hidden responses deliberately; the module layer buffers command messages before replaying sends/chats.

Prefer `Room.send(...)` for announcements. It supports player ids, player objects, arrays, team targets (`"red"`, `"blue"`, `"teams"`), `"mixed"`, and target filter functions.

## Runtime and State Rules

States are self-contained gameplay phases. A state factory returns a `StateApi` with `run` and optional `join`, `leave`, `chat`, and `command` handlers.

Intentional repetition inside Classic state files is part of the design. Do not extract state policy, transition flow, or football-rule sequencing just to remove duplication across states. Previous broad abstractions for state policy made the room harder to reason about. Prefer keeping each state locally explicit, even when similar code exists in nearby states.

Shared Classic helpers should be used for stable domain primitives, geometry, parsing, physics hooks, command plumbing, formatting, and other behavior that is genuinely lower-level than a gameplay state. Avoid central “transition helper” or “rule engine” modules that hide who scores, who gets possession, who kicks next, or which state comes next.

When repeated state logic is subtle, improve the local code instead of extracting it: use clearer local names, short comments that state the football rule being applied, and consistent branch ordering. A reader should be able to understand a state by reading that state file without jumping through a shared policy abstraction.

Use `$effect` for room side effects. Effects are deferred and are not visible in the current snapshot.

Use `$next` for transitions. `$next` stops the current handler by throwing the runtime sentinel; do not add dead `return` statements after it.

Use `$dispose` to undo temporary changes. If a state locks the ball, changes avatars, traps players, shows LOS/first-down/crowding discs, or changes temporary collision behavior, register cleanup near the setup.

Use `$before()` only when a previous snapshot is guaranteed. It throws when unavailable.

Use `$tick()` for timing. `now` is the absolute engine tick, `current` is ticks since this state instance started, and `self` is ticks since entering this state name across same-state transitions.

For same-state `$next`, the default disposal behavior refreshes params/API without full teardown. Use `disposal: "IMMEDIATE"` when the state needs full cleanup and setup.

Keep `run` methods as orchestration when they become complex: build a read-only frame once, then call focused `$handle...` helpers in deterministic order. Hard-stop rules such as touchdowns, penalties, illegal touches, and bounds checks should run before lower-priority flow rules.

Chat and command handlers run outside the tick loop and see the last snapshot. Do not depend on real-time physics validation there.

## Gameplay Helpers and Physics

Prefer shared helpers from `@common`, `@modes/classic/shared`, and `@modes/classic/hooks` for lower-level reusable mechanics. Do not re-implement field geometry, LOS math, down-state updates, penalties, scoring constants, reception detection, interception detection, pushing, crowding, or stadium positioning when helpers exist. This does not override the state convention above: repeated state policy may remain explicit inside states when extraction would make rule flow less local.

Use hooks such as `$lockBall`, `$unlockBall`, `$setBallActive`, `$setBallInactive`, `$setLineOfScrimmage`, `$unsetLineOfScrimmage`, `$setFirstDownLine`, `$unsetFirstDownLine`, and crowding helpers instead of raw disc mutation in states.

When placing players or discs into formations, zero speed fields when needed. Avoid leaving hidden helper discs, avatars, collision groups, or ball state changed after a state exits.

## Stadiums and Collision

The stadium docs in `docs/headless/STADIUM-FILE.md` and `docs/headless/COLLISION-FLAGS.md` describe the `.hbs` model. Stadium generation code lives in `src/common/stadium-generator` and `src/common/stadium-builder`.

Collision flags are bit fields. Use `room.collisionFlags` / `$.CollisionFlags` rather than hardcoded numbers unless working on the flag definitions themselves.

Player `cMask` is constrained by HaxBall behavior; hooks usually alter player `cGroup` and leave masks at the expected defaults.

## i18n and User-Facing Text

User-facing room messages should use Lingui `t` from `@lingui/core/macro` unless they are deliberately dynamic runtime text that cannot be extracted. Keep message literals inside `room.send(...)` / `$.send(...)` calls where possible.

When adding or changing translatable text, run:

```sh
pnpm run i18n
```

The supported locales are `en` and `pt`. `LANGUAGE=pt-BR` resolves to `pt`.

For player lists and football-context messages, prefer helpers such as `formatNames(...)`, `formatTeamName(...)`, and `cn(...)` instead of manual string assembly.

## TypeScript and Style

The project is strict TypeScript with `moduleResolution: "bundler"` and path aliases in `tsconfig.json`. Use aliases like `@runtime/*`, `@core/*`, `@haxball/*`, `@modes/*`, `@room/*`, `@common/*`, `@api/*`, `@i18n`, and `@env/*`.

Prefer explicit domain types and small pure helpers. Avoid hidden side effects, exception-based control flow for normal gameplay rules, unnecessary `let`, IIFEs for simple derivations, and mutation of arrays/objects unless it is clearly contained and simpler.

Use project formatting through Oxfmt and linting through Oxlint. Do not churn unrelated formatting.

Keep docs source readable. Do not hard-wrap prose in the middle of sentences unless the surrounding file already follows that style and the edit is intentionally narrow.

## Testing and Verification

For behavior changes, run at least:

```sh
pnpm exec tsc --noEmit
pnpm test -- --run
```

For release or entrypoint changes, also run:

```sh
pnpm run build
```

For i18n changes, run `pnpm run i18n`. For docs-only changes, `git diff --check` is usually enough unless the docs are generated or referenced by tests.

Existing tests focus on stadium builder/generator behavior. Add focused tests when changing pure helpers, stadium generation, parsing, geometry, or planning logic.

## Release and Production Notes

Before changing release behavior, read the current deployment and operations runbook for the room/API release process.

Room release assets are GitHub release tarballs named `room-{tag}.tgz`, for example `room-v1.0.2.tgz`. The production API discovers and downloads those assets when a room for that version is launched. Do not manually copy room packages into the Oracle cache.

Keep `package.json` version in sync with the release tag without the leading `v`. Keep `packageManager` set to pnpm. Release registration should use the API discovery endpoint and `installStrategy: "npm-install"` until the API supports a pnpm strategy.

Do not commit production secrets, `.env.production`, cached room packages, room logs, SQLite data files, release tarballs, or generated package-lock files.

## Git and Change Hygiene

The worktree may contain user changes. Do not revert or overwrite changes you did not make. If unrelated files are dirty, leave them alone.

Avoid destructive Git commands unless explicitly requested. Do not run `git reset --hard` or checkout files to discard changes without clear approval.
