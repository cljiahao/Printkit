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
  `{ok:false, status:409}` instead of a generic 500. An optional
  `input.jobType` is passed through to the insert (defaulting to `'label'`
  when omitted, since the DB column's own default still only accepts that
  value) — this keeps the function's own shape from hardcoding one job
  type ahead of the DB constraint widening. An optional
  `input.locationRef` is resolved via `print-locations.ts`'s
  `resolveActiveLocation`, but only used when the resolved location's
  `vendor_id` matches `input.vendorId` (it isn't itself vendor-scoped —
  a cross-vendor match is treated as unresolved rather than routing the
  job somewhere no bridge of the real owning vendor will ever see it).
  When `location_id` is still null after that (ref omitted, unresolved,
  or cross-vendor), `listActiveLocations` is checked as a fallback: a
  vendor with exactly one active location has no routing ambiguity, so
  the job auto-delivers there; zero or 2+ active locations leaves it
  truly unrouted (`location_id: null`). Both the resolve and the fallback
  are best-effort — a missing ref, an unresolved/cross-vendor match, or
  either lookup throwing is a no-op, never a rejection.
  `updatePrintJobStatus(jobId, status)`: the single choke point for
  changing a row's status — updates it, then (on a terminal status,
  `"printed"`/`"failed"`) calls `notifyKitPrintStatus` with the row's own
  `source_kit`, kit-agnostic — no longer hardcoded to qkit. Called by
  `history/actions.ts`'s `reprintJob` and `bridge/actions.ts`'s
  `reportPrintResult`, both of which check the calling vendor owns the job
  first.
- `print-locations.ts` — `print_locations` CRUD via the service client
  (RLS is bypassed, so each function's `.eq(...)` vendor/id scoping is the
  real authorization boundary, not defense in depth).
  `createOrUpdatePrintLocation(args)`: upserts on `(source_kit, source_ref)`.
  `resolveActiveLocation(sourceKit, sourceRef)`: looks up an active location
  by `(source_kit, source_ref)` only — not vendor-scoped, so callers (see
  `print-jobs.ts`) must check the returned `vendorId` themselves before
  trusting the match. `listActiveLocations(vendorId)`: a vendor's active
  locations (`id`, `label`, `source_ref`), oldest first; also backs
  `print-jobs.ts`'s single-active-location auto-delivery fallback and
  `dashboard/bridge/page.tsx`'s `?booth=` deep-link matching (against
  `source_ref`, the calling kit's own opaque location id). All three fail open
  (`[]`/`null`/a `{ok:false}` result plus a logged error) on a query error,
  never throwing.
- `print-jobs-list.ts` — `listPrintJobs(supabase, vendorId)`: the vendor's
  own job history, newest first, narrowed to the `PrintJob` type (`status`/
  `job_type` as real literal unions instead of the generated `string`),
  with each row's booth embedded via `select("*, print_locations(label)")`
  (`print_locations: { label } | null` on `PrintJob`, null when
  `location_id` is null). `countUnroutedJobs(vendorId)`: count of the
  vendor's `queued` jobs with a `null location_id` — jobs that never
  resolved to a print location — used by the dashboard overview's
  unrouted-jobs callout. Fails open (returns `0`) on a query error, same
  convention as `listPrintJobs`.
- `print-job-payload.ts` — `payloadField(payload, key, fallback = "—")`:
  the one place that defensively narrows a string field out of a
  `print_jobs.payload` jsonb value, shared by the history table's display
  columns and the bridge's auto-print label extraction.
- `print-job-renderers.ts` — `getJobRenderer(jobType)`: `job_type` → canvas
  renderer lookup, one entry today (`'label'`, wrapping `label-render.ts`'s
  `renderLabelCanvas`) — the seam a second job type plugs into, returns
  `null` for an unrecognized type so the bridge can report a clear failure
  instead of guessing.
- `kit-callback.ts` — `notifyKitPrintStatus(kitSlug, sourceRef, status)`:
  fire-and-forget outbound callback on job status change, kit-agnostic —
  looks the calling kit's `callback_url`/`callback_secret` up from
  `kit_api_keys` (`0006_kit_api_keys_callback.sql`) instead of assuming
  qkit via env vars, and no-ops silently if either is unset (not every
  calling kit needs a callback). Never throws; every failure (lookup error,
  missing config, network error, non-2xx) is swallowed after a log line.
- `vendor-session.ts` — `getVendorSession()`: shared dashboard auth guard
  (gets a session-scoped Supabase client and the authenticated user,
  redirects to `/login` if none).
- `merqo-rpc.ts` — shared `.schema("merqo").rpc(...)` caller for every cross-kit `merqo.*` RPC below.
- `merqo-vendor-profile.ts` — `getOrCreateVendorProfile`/`upsertVendorProfile`, the shared vendor display-name source used by `dashboard-nav.tsx`.
- `merqo-vendor-feedback.ts` — `submitVendorFeedback`, backs `AccountMenu`'s required `onFeedbackSubmit`.
- `merqo-support.ts` — `submitSupportMessage`, backs `AccountMenu`'s required `getHelp` (form mode).
- `niimbot-print.ts` — `connectPrinter`/`printLabel`/`disconnectPrinter`, a thin wrapper around `@mmote/niimbluelib`'s `NiimbotBluetoothClient`/`ImageEncoder` for the NIIMBOT B1 specifically (`printDirection: "top"`, `printheadPixels: 384`).
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
