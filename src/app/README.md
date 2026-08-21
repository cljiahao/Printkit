# app

## Purpose

Next.js App Router tree — every page, layout, route handler, and API surface
for this project.

## Contents

- `apple-icon.tsx` — `AppleIcon` route handler; renders `brandIcon(180)` as a 180×180 PNG for iOS home-screen touch icons.
- `auth/callback/` — Supabase auth callback route (`GET`, OAuth code exchange via `exchangeCodeForSession`); redirects to `next` (same-origin only) or `/dashboard` on success, `/login?error=oauth` on failure or a missing code.
- `dashboard/` — authenticated vendor area. Currently a single placeholder page (`page.tsx`) gated by `getVendorSession()` — no sub-routes yet.
- `error.tsx` — root-level error boundary (`"use client"`) for every route (landing, login, auth, dashboard — there is no more specific one yet). Branded like `login/page.tsx` (`ElevatedCard` + `Wordmark`), with a "Try again" (`reset()`) and a "Back to home" (`next/link`) action. Logs the caught error to the console.
- `globals.css` — Tailwind v4 entry point: theme tokens, base layer, and custom utility classes; `@source` includes `node_modules/@merqo/ui/dist` so its components' Tailwind classes get compiled here too. Color tokens are named "Banknote Engrave" in the file's own header comment (engraved teal-green primary, steel-blue secondary) — the cross-kit brand pick this repo was seeded with.
- `icon.tsx` — `Icon` route handler; renders `brandIcon(32)` as a 32×32 PNG favicon.
- `layout.tsx` — `RootLayout`. Loads `Fraunces`/`Inter`/`JetBrains_Mono` via `next/font/google`, sets `metadata`, wraps children in `next-themes`' `ThemeProvider` (`attribute="class"`, system default), then `TooltipProvider` + `Toaster`.
- `login/` — combined sign-in/sign-up page, including the "Forgot password?" flow — see its own README.
- `page.tsx` — `Home`, the marketing landing page. Currently a placeholder ("printkit" heading + one line of copy); no `src/components/landing/` sections are composed here yet.

## Connectivity

`login/` is the vendor auth entry point; `dashboard/` is the authenticated
vendor area, gated by `getVendorSession()` (`@/lib/vendor-session`) inside
its own `page.tsx`. `src/proxy.ts` also runs `updateSession` (session
refresh + `/dashboard/*` → `/login` redirect) on every request via
`src/lib/supabase/middleware.ts`. `layout.tsx` is the ancestor of every
route below; `page.tsx` (the landing page) is the only route directly
under `app/` besides the special Next.js files. No `api/`, `actions/`, or
`admin/` directories exist yet — the `/api/v1/print-jobs` route and an
admin console are later-plan work (see `docs/superpowers/specs/2026-08-21-
printkit-v0.1-design.md`).

## Parent

[src](../README.md)
