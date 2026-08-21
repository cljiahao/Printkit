# test

## Purpose

Test surfaces that don't live next to their source file: Vitest's shared
setup, contract tests against the HTTP API surface, and cheap regex-presence
guards against migration drift. Most tests live co-located under `src/`
(`*.test.ts`); this folder is for the ones that don't fit that shape.

## Contents

- `setup.ts` — Vitest global setup: a `ResizeObserver` stub (jsdom has none,
  Radix primitives read element size on mount), the standard RTL `cleanup()`
  after each test, and a raised `asyncUtilTimeout` (10s, matching
  `vitest.config.ts`'s own `testTimeout`) — the default 1s/5s pair was too
  tight for this suite's size under full-run load, causing unrelated tests to
  flake on `waitFor`/`findBy*` timeouts rather than a real assertion failure.
- `contract/` — HTTP API contract test (mirrors merqo's qkit-metrics
  precedent). See its own README.
- `db/` — regex-presence guards against migration drift. See its own README.

## Parent

See the repo root [README.md](../README.md) for the full layout.
