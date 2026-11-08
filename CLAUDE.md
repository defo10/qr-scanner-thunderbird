# CLAUDE.md

[SPEC.md](SPEC.md) is the source of truth for scope and chunk order. Implement one chunk at a time, in order.

## Comments

- Keep comments to a minimum. Comment only non-obvious implications, trade-offs or constraints (e.g. "terminate is the only way to stop a running WASM call", "TB 128 returns X for inline parts").
- When a piece of code embodies several such points, list them as short bullets.
- Comments are self-contained: never reference SPEC.md, chunk numbers or this file.
- No comments that restate the code. No JSDoc for self-explanatory signatures. No commented-out code. No change-log comments.

## State-free, functional style

- Prefer pure functions over classes and mutable state.
- Push side effects (`messenger.*`, Worker, clipboard, storage, DOM) to the edges: `src/platform/*` and the `src/entries/*` composition roots.
- Pass dependencies in explicitly. Do not import singletons.
- Use immutable data. Return new values; never mutate arguments.
- State that must exist (overlay state, scan cancellation) lives in one place and changes only through pure reducers or explicit signals.

## Deep modules

- Each feature folder exposes a small interface: one `index.ts` with a few functions and types, hiding substantial implementation.
- Never import feature internals from outside the feature (lint enforces this).
- Prefer fewer, more capable functions over shallow pass-through layers.
- No interface with a single implementation unless a test or platform seam needs it. Seams belong in `src/platform/`.

## Tests

- DAMP over DRY: each test reads top to bottom on its own, with arrange, act and assert visible.
- Shared setup goes through descriptive builders (`aMessageWith(anImageAttachment(...))`), not shared mutable `beforeEach` state.
- Test names describe behavior in plain language ("reports a timeout and continues with the next attachment").
- Assert on observable outcomes (port events, rendered text, clipboard contents), not internals.
- Use fakes, not mocks. Fakes live in `tests/fakes/`.
- Cover the important paths, not every line.

## Workflow

- One chunk per commit.
- `npm run typecheck && npm run lint && npm test` must pass before each commit.
- New dependencies: pin an exact version (no `^`/`~`) and state why in the commit message.

## Hard constraints

- No network access. No remote fetches of any kind.
- Decoded content never goes into `innerHTML`.
- Only `src/platform/tb-api.ts` touches `messenger.*`.
- Nothing decoded is persisted to disk.
