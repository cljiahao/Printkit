# app

## Purpose

Next.js App Router tree — every page, layout, route handler, and API surface
for this project.

## Contents

- `actions/` — server actions backing Sheet-embedded widgets on the dashboard nav (feedback, "Get help") plus sign-out; see its own README.
- `api/v1/print-jobs/` — inbound `POST` route for calling kits (qkit) to
  queue a print job. Verifies the caller's bearer secret via
  `verifyKitAuth` (`@/lib/kit-auth`), validates the body with a Zod schema
  (`vendor_id` UUID, `payload` object, `source_ref`), then delegates to
  `createPrintJob` (`@/lib/print-jobs`). Returns 401 unauthenticated, 400
  invalid body, 201 with the new row's `id` on success, or the
  `createPrintJob` error's own status (e.g. 409 on a duplicate
  `source_kit`+`source_ref`).
- `apple-icon.tsx` — `AppleIcon` route handler; renders `brandIcon(180)` as a 180×180 PNG for iOS home-screen touch icons.
- `auth/callback/` — Supabase auth callback route (`GET`, OAuth code exchange via `exchangeCodeForSession`); redirects to `next` (same-origin only) or `/dashboard` on success, `/login?error=oauth` on failure or a missing code.
- `dashboard/` — authenticated vendor area, gated by `layout.tsx`'s `getVendorSession()` and wrapped in `dashboard-nav.tsx`'s composed `@merqo/ui` `DashboardNav`/`AccountMenu` — see its own README.
- `error.tsx` — root-level error boundary (`"use client"`) for every route (landing, login, auth, dashboard — there is no more specific one yet). Branded like `login/page.tsx` (`ElevatedCard` + `Wordmark`), with a "Try again" (`reset()`) and a "Back to home" (`next/link`) action. Logs the caught error to the console.
- `globals.css` — Tailwind v4 entry point: theme tokens, base layer, and custom utility classes; `@source` includes `node_modules/@merqo/ui/dist` so its components' Tailwind classes get compiled here too. Color tokens are named "Banknote Engrave" in the file's own header comment (engraved teal-green primary, steel-blue secondary) — the cross-kit brand pick this repo was seeded with.
- `icon.tsx` — `Icon` route handler; renders `brandIcon(32)` as a 32×32 PNG favicon.
- `layout.tsx` — `RootLayout`. Loads `Fraunces`/`Inter`/`JetBrains_Mono` via `next/font/google`, sets `metadata`, wraps children in `next-themes`' `ThemeProvider` (`attribute="class"`, system default), then `TooltipProvider` + `Toaster`.
- `login/` — combined sign-in/sign-up page, including the "Forgot password?" flow — see its own README.
- `page.tsx` — `Home`, the marketing landing page. Currently a placeholder ("printkit" heading + one line of copy); no landing-page component sections exist yet.

## Connectivity

`login/` is the vendor auth entry point; `dashboard/` is the authenticated
vendor area, gated by `getVendorSession()` (`@/lib/vendor-session`) inside
`dashboard/layout.tsx` (every `dashboard/*` page inherits the guard from
the layout now, not its own `page.tsx`). `src/proxy.ts` also runs
`updateSession` (session refresh + `/dashboard/*` → `/login` redirect) on
every request via `src/lib/supabase/middleware.ts`. `layout.tsx` (root)
is the ancestor of every route below; `page.tsx` (the landing page) is
the only route directly under `app/` besides the special Next.js files.
`api/v1/print-jobs/` is the inbound route qkit calls on order-placed;
printkit's own outbound call back into qkit on job status change is
`src/lib/qkit-client.ts`'s `notifyQkitPrintStatus`, invoked from
`updatePrintJobStatus` (`@/lib/print-jobs`). `dashboard/dashboard-nav.tsx`
calls `actions/feedback.ts` and `actions/support.ts` directly (their
Sheet UI lives inside `@merqo/ui`'s `DashboardNav`, not a page route);
`dashboard/layout.tsx` calls `actions/auth.ts`'s `signOutAction`. No
`admin/` directory exists yet.

## Parent

[src](../README.md)
