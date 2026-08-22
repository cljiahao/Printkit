# lib

## Purpose

Framework-agnostic logic: auth/session helpers, shared types, and small
utilities. One subfolder (`supabase/`) groups the DB client cluster;
everything else sits flat here.

## Contents

- `types.ts` — the `Database` interface, generated via
  `supabase gen types typescript --local --schema printkit` (see the
  `supabase-migrate` skill) and regenerated after any schema change. Satisfies
  Supabase's `GenericSchema` constraint with proper `Tables`, `Views`, and
  `Functions` typing for the `printkit` schema.
- `kit-auth.ts` — `hashApiKey`/`verifyKitAuth`: bearer-secret verification
  for calling kits, checked on every `/api/v1/*` route before any DB access.
- `print-jobs.ts` — `createPrintJob(input)`: inserts a queued `print_jobs`
  row via the service client and returns its `id`. `(source_kit, source_ref)`
  is unique, so a retried call for the same source order returns a clean
  `{ok:false, status:409}` instead of a generic 500.
  `updatePrintJobStatus(jobId, status)`: the single choke point for
  changing a row's status — updates it, then (only when `source_kit` is
  `"qkit"` and the new status is terminal, `"printed"`/`"failed"`) calls
  `notifyQkitPrintStatus` to tell qkit. Not yet called by any UI or bridge
  code — Plan 3's manual-reprint action and Plan 4's bridge print-result
  handler both will.
- `qkit-client.ts` — `notifyQkitPrintStatus(orderId, status)`: fire-and-forget
  outbound callback to qkit's `POST /api/printkit/print-status`, a plain
  (no `kit_slug:` prefix) shared-secret bearer check — different from this
  repo's own multi-caller `kit-auth.ts` convention, since qkit has exactly
  one caller for that route. Never throws; every failure (missing secret,
  network error, non-2xx) is swallowed after a log line.
- `vendor-session.ts` — `getVendorSession()`: shared dashboard auth guard
  (gets a session-scoped Supabase client and the authenticated user,
  redirects to `/login` if none).
- `merqo-auth.ts` — `bearerOk`/`provisionBearerOk` (constant-time bearer-secret
  checks against `MERQO_METRICS_SECRET`/`MERQO_PROVISION_SECRET` respectively)
  — a separate auth mechanism from `kit-auth.ts`'s `verifyKitAuth` (which is
  for peer-kit-to-kit calls, keyed by `kit_api_keys`). Not yet wired to any
  route in this repo — no `/api/merqo/*` routes exist here yet.
- `merqo-rpc.ts` — shared `.schema("merqo").rpc(...)` caller for every cross-kit `merqo.*` RPC below.
- `merqo-vendor-profile.ts` — `getOrCreateVendorProfile`/`upsertVendorProfile`, the shared vendor display-name source used by `dashboard-nav.tsx`.
- `merqo-vendor-feedback.ts` — `submitVendorFeedback`, backs `AccountMenu`'s required `onFeedbackSubmit`.
- `merqo-support.ts` — `submitSupportMessage`, backs `AccountMenu`'s required `getHelp` (form mode).
- `brand-icon.tsx` — `brandIcon(size)` + `BRAND_MINT`/`BRAND_INK`: the
  printkit "P" mark as a `ReactElement` for `ImageResponse`-generated icons
  (favicon, apple-touch) — hex literals, not theme tokens, since
  `ImageResponse` needs concrete CSS colors. Tracks the "Banknote
  Engrave" theme's dark-mode brighter primary, so the dark-ink text on top
  stays legible.
- `action-result.ts` — `ActionResult<T>`: the discriminated
  `{success:true,...T} | {success:false,error}` shape every Server Action
  returns.
- `env.ts` — `publicEnv`: required-env-var accessors that throw at import
  time if unset, instead of silently reading `undefined`.
- `utils.ts` — `cn()` (clsx + tailwind-merge), `formatDate()` (a
  `date`-column "YYYY-MM-DD" string -> display date, parsed/formatted with
  an explicit UTC anchor so it never shifts by a day depending on the
  server's runtime timezone), and `formatDateTime()` (a `timestamptz`
  string -> display date+time, pinned to `en-SG`/`Asia/Singapore` for the
  same reason).

## Connectivity

Consumed throughout `src/app/` (route handlers, Server Actions, dashboard
pages) and `src/components/`. `supabase/` is the one subfolder with its own
concern — see its README.

## Parent

[printkit](../../README.md)
