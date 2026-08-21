# hooks

## Purpose

Zero-call-site adapter over `@merqo/ui`'s shared hooks — keeps every existing
`run(async () => { … })` call site working unchanged while the actual
pending/error-state logic lives in the shared package.

## Contents

- `use-async-action.ts` — `useAsyncAction()`: thin wrapper over `@merqo/ui`'s
  `useAsyncAction`, reproducing this hook's original per-call-dynamic-closure
  shape (`@merqo/ui`'s version binds one action at hook-creation time; this
  adapter binds it to "call whatever closure you're given" instead). Also
  re-exports `navigatingAway`.
- `use-async-action.test.tsx` — covers the adapter's pending/error/reset
  behavior and that a thrown error still resets `pending`.

## Parent

[src](../README.md)
