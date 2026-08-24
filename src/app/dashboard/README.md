# dashboard

## Purpose

The authenticated vendor area (`/dashboard/*`).

## Contents

- `layout.tsx` — `DashboardLayout`, the ancestor of every route below.
  Gates access via `getVendorSession()` (`@/lib/vendor-session`), resolves
  the vendor's stall name via `getOrCreateVendorProfile`
  (`@/lib/merqo-vendor-profile`), then wraps `children` in
  `dashboard-nav.tsx`'s `DashboardNav` and a `max-w-7xl` `<main>`.
- `dashboard-nav.tsx` — `DashboardNav`: composes `@merqo/ui`'s shared
  `DashboardNav`/`AccountMenu` — same shared-component contract every
  sibling kit uses. Owns the printkit wordmark, the Overview/Bridge/History
  nav links, active-route highlighting, and thin throw-adapting wrappers
  around `submitFeedbackAction`/`submitSupportMessageAction`
  (`@/app/actions/{feedback,support}`), which both return a
  `{success, error}` result rather than throwing, while the shared
  component's `onSubmit`/`onFeedbackSubmit` contract needs a promise that
  rejects on failure. `vendor.subtitle` (not just `vendor.name`, which
  only feeds the avatar's initials) carries the visible vendor name — see
  `AccountMenuProps` in `@merqo/ui`. No plan/tier/tour concept exists in
  printkit yet, so those optional shared-component props are omitted.
- `dashboard-nav.dom.test.tsx` — RTL/jsdom test: renders the wordmark and
  vendor name.
- `layout.dom.test.tsx` — RTL/jsdom test: renders the nav (mocked) with
  the vendor's stall name, plus the page `children`.
- `job-status-badge.tsx` / `job-status-badge.dom.test.tsx` — shared status
  badge (queued/printing/done/failed) used by `history/`'s table.
- `page.tsx` / `page.dom.test.tsx` — dashboard overview: fetches
  `listActiveLocations` (`@/lib/print-locations`) and renders one
  `BridgeStatus` per active location (empty-state message when there are
  none), a qkit connection info card, an unrouted-print-jobs callout (from
  `countUnroutedJobs`, `@/lib/print-jobs-list`) linking to
  `/dashboard/history?unrouted=1` when the count is above zero, and recent
  print jobs via `JobHistoryTable` (limited to 5 jobs), passing the same
  `listActiveLocations` result down so unrouted rows get an assign control.
- `history/` — vendor-facing print job history — see its own README.
- `bridge/` — Bridge-mode runtime (Web Bluetooth pairing, auto-print,
  presence, wake lock) — see its own README.

## Connectivity

`src/proxy.ts` runs `updateSession` (session refresh + `/dashboard/*` →
`/login` redirect) on every request via `src/lib/supabase/middleware.ts`,
ahead of this `layout.tsx`'s own `getVendorSession()` check.
`dashboard-nav.tsx`'s sign-out button calls `actions/auth.ts`'s
`signOutAction`, passed down from `layout.tsx`.
`page.dom.test.tsx`'s `listActiveLocations` mocks now include each
location's `source_ref`, matching `@/lib/print-locations`' return shape —
see `bridge/README.md` for what reads it.

## Parent

[app](../README.md)
