# e2e

## Purpose

Playwright end-to-end smoke tests. They need only `pnpm dev` and
`playwright install`, with dummy Supabase values and no live database.

## Contents

- `smoke.spec.ts` — public smoke: `/login` renders its "Continue with Google"
  button, and the public `/guides/bluetooth-printers` guide renders its
  heading. printkit has no landing page (`/` redirects to `/dashboard`), so
  the guide stands in as the public page.
- `auth-guard.spec.ts` — signed-out route protection: `/`, `/dashboard` and
  `/dashboard/printers` all end at `/login`. `src/proxy.ts` resolves
  `user: null` locally when there is no session cookie, so the redirect fires
  without a database.

## Connectivity

Run by `pnpm test:e2e` (`playwright.config.ts`, which starts `pnpm dev`) and
by the `e2e (public smoke)` job in `.github/workflows/ci.yml`. Vitest does
not pick these files up: its `include` covers `test/`, `src/` and
`bridge-agent/src/` only.

## Parent

[printkit](../README.md)
