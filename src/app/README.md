# app

## Purpose

Next.js App Router tree — every page, layout, route handler, and API surface
for this project.

## Contents

- `actions/` — server actions shared across routes: auth, feedback, Pro-upgrade requests, support messages.
- `admin/` — Merqo-team internal admin console (`/admin`), gated by `requireAdmin()` — platform overview stats and a cross-vendor plan-management table.
- `api/` — the cross-kit `v1` payment API (`checkout`, `vendors`) plus internal `merqo/*` provisioning routes.
- `apple-icon.tsx` — `AppleIcon` route handler; renders `brandIcon(180)` as a 180×180 PNG for iOS home-screen touch icons.
- `auth/` — Supabase auth callback route (OAuth code exchange).
- `dashboard/` — authenticated vendor area (payment config, transactions, stats, profile, plan).
- `error.tsx` — root-level error boundary (`"use client"`) for every route not covered by a more specific one (landing, login, auth, admin — `dashboard/` has its own `error.tsx`). Branded like `login/page.tsx` (`ElevatedCard` + `Wordmark`), with a "Try again" (`reset()`) and a "Back to home" (`next/link`) action. Logs the caught error to the console.
- `globals.css` — Tailwind v4 entry point: theme tokens, base layer, and custom utility classes; `@source` includes `node_modules/@merqo/ui/dist` so its components' Tailwind classes get compiled here too. Color tokens are named "Banknote Engrave" in the file's own header comment (engraved teal-green primary, steel-blue secondary) — the founder-approved cross-kit brand pick as of 2026-08-19. Also defines `.tour-example`/`.tour-example-row`/`.tour-example-pill`/`.tour-example-label`, the shared styling for the small HTML preview embedded in the dashboard tour's first step (see `src/components/README.md`'s `tour-steps.ts` entry).
- `icon.tsx` — `Icon` route handler; renders `brandIcon(32)` as a 32×32 PNG favicon.
- `layout.tsx` — `RootLayout`. Loads `Space_Grotesk`/`Inter`/`JetBrains_Mono` via `next/font/google`, sets `metadata`, wraps children in `next-themes`' `ThemeProvider` (`attribute="class"`, system default) so `@merqo/ui`'s always-on account-menu Light/Dark/System control actually toggles the `.dark` class, then `TooltipProvider` + `Toaster`.
- `login/` — combined sign-in/sign-up page, including the "Forgot password?" flow.
- `page.tsx` — `Home` async server component, the marketing landing page. Composes `Nav`, `Hero`, `Benefits`, `HowItWorks`, `Faq`, `ClosingCta`, `Footer`, and `BackToTop` from `@/components/landing/`. `ClosingCta` is the family's documented ink-band closing section, rendered between `Faq` and `Footer`. Reads the live Pro price via `getPricing()` (`@/lib/pricing`) and passes it down to `Benefits`/`Faq` as `monthlyPriceLabel` — no hardcoded price string.

## Connectivity

`login/` is the vendor auth entry point; `dashboard/` is the authenticated
vendor area. `admin/` is a separate, Merqo-team-only authenticated area
(session-gated the same way as `dashboard/`, but additionally requiring an
`admins` table row). `api/` is the cross-kit payment surface (bearer-secret
authenticated) plus Merqo's admin-facing provisioning routes. `actions/`
holds server actions shared across routes rather than colocated with one
page. `layout.tsx` is the ancestor of every route below; `page.tsx` (the
landing page) is the only route directly under `app/` besides the special
Next.js files.

## Parent

[src](../README.md)
