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
- `site-url.ts` — `publicSiteUrl()`: the absolute origin a printer can
  reach printkit on (`PRINTKIT_PUBLIC_URL`, else Vercel's production or
  deployment host), or null. Used for a CloudPRNT printer's address and
  Feie's callback URL; null rather than "" so nothing hands a device a
  relative URL.
- `safe-redirect.ts` — `safeRedirectPath(next, fallback)`: rejects an absolute
  URL, a protocol-relative `//`/`/\` path, or one carrying an embedded control
  character, falling back otherwise. The open-redirect guard for the
  `/legal/accept` flow's `next` search param.
- `legal-gate.ts` — `checkLegalAcceptance(email)`/
  `requireCurrentLegalAcceptance(email)`. printkit owns no acceptance
  record — merqo does — so currency is a bearer-authed (`MERQO_CUSTOMER_SECRET`)
  `GET /api/merqo/legal-status` call, cached in the new `legal_check_state`
  table (migration `0007`) for 5 minutes to keep the call off every gated
  render. Fails closed (returns `false`/redirects to `/legal/accept`) on a
  missing secret, an unreachable merqo, a non-2xx response, or a malformed
  body. `requireCurrentLegalAcceptance` is a no-op when `email` is falsy (the
  caller already handled the no-session case) and redirects a stale vendor to
  `/legal/accept` otherwise.
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
- `label-image.ts` — `fetchLabelCanvas(jobId)`/`fetchSampleLabelCanvas(locationId)`/
  `pngToCanvas(blob)`: browser-side, the bridge's only image handling now
  that no device draws its own label. It downloads the PNG the server
  rendered and decodes it into the canvas `niimbluelib` encodes, so a
  Bluetooth printer produces the same label as every other connector.
- `printer-info-copy.ts` — `INFO_COPY`/`BLUETOOTH_WARNING`: the
  plain-language explanation behind every badge, icon and filter a vendor
  meets while choosing a printer. One module because the same fact has to
  appear on the picker, in a setup wizard and in the Bluetooth guide, and a
  vendor deciding what to buy should not meet three wordings of it.
- `kit-callback.ts` — `notifyKitPrintStatus(kitSlug, sourceRef, status)`:
  fire-and-forget outbound callback on job status change, kit-agnostic —
  looks the calling kit's `callback_url`/`callback_secret` up from
  `kit_api_keys` (`0006_kit_api_keys_callback.sql`) instead of assuming
  qkit via env vars, and no-ops silently if either is unset (not every
  calling kit needs a callback). Never throws; every failure (lookup error,
  missing config, network error, non-2xx) is swallowed after a log line.
- `vendor-session.ts` — `getVendorSession()`: shared dashboard auth guard
  (gets a session-scoped Supabase client and the authenticated user,
  redirects to `/login` if none, then bounces to `/legal/accept` via
  `requireCurrentLegalAcceptance` — see `legal-gate.ts` above — if the
  vendor's terms/privacy acceptance is stale). This is printkit's single
  vendor-gate entry point (`dashboard/layout.tsx` calls it), so the legal
  check lives here once rather than duplicated per call site.
- `merqo-rpc.ts` — shared `.schema("merqo").rpc(...)` caller for every cross-kit `merqo.*` RPC below.
- `merqo-vendor-profile.ts` — `getOrCreateVendorProfile`/`upsertVendorProfile`, the shared vendor display-name source used by `dashboard-nav.tsx`.
- `merqo-vendor-feedback.ts` — `submitVendorFeedback`, backs `AccountMenu`'s required `onFeedbackSubmit`.
- `merqo-support.ts` — `submitSupportMessage`, backs `AccountMenu`'s required `getHelp` (form mode).
- `niimbot-print.ts` — `connectPrinter`/`printLabel`/`disconnectPrinter`, a thin wrapper around `@mmote/niimbluelib`'s `NiimbotBluetoothClient`/`ImageEncoder`. `printLabel`'s optional `model` param (defaults to `niimbot-model.ts`'s `DEFAULT_NIIMBOT_MODEL`) looks up that model's `printDirection` instead of hardcoding the B1's `"top"` inline (the label bitmap itself now arrives from the server, so nothing about label size lives on the device). `niimbot-print.test.ts` mocks the `NiimbotBluetoothClient` constructor with a `function` expression (not an arrow) so `vitest` 4 can call it with `new`.
- `niimbot-model.ts` — `NIIMBOT_MODELS`/`DEFAULT_NIIMBOT_MODEL`: per-model print config, one entry (`B1`) today — `niimbluelib` itself already supports other NIIMBOT models, so adding a second one here is a config entry, not a code change in `niimbot-print.ts`.
- `printer-catalog.ts` — `PRINTER_CATALOG`/`getCatalogEntry`/`listCatalog`/
  `worksWithIpadAlone`/`recommendationTier`/`isRecommended`/`compareRecommended`.
  Recommendation follows what the vendor lives with, not the connector:
  tier 1 works with an iPad alone and costs nothing after purchase (any WiFi
  printer, Star or Feie WiFi), tier 2 works alone but has a running cost
  (`monthlyCost: "data_plan"`, a 4G SIM), tier 3 needs a helper device.
  Cheapest first within a tier, then easiest setup. Only tier 1 gets the
  "Recommended" badge. The catalog is the static list of supported printer models and what
  each needs (connector, driver, connectivity, whether a helper device is
  required, label width range, setup effort, price band, and a
  `hardwareVerified` flag that stays `false` until a real unit passes the
  hardware gate). Code, not a table: a model is only selectable once its
  driver exists. `devOnly` hides the `virtual` test printer outside
  development. `worksWithIpadAlone` is the single rule behind that badge and
  its filter, so the two can never disagree.
- `label-layout.ts` — `buildLabelLayout(payload, size)`: the
  device-independent description of one label (size in mm plus positioned
  text and QR elements, `MAX_LABEL_CHARS` truncation on the customer name).
  Pure, so it is unit-testable without a canvas, and it is the one place
  label content changes: raster drivers render it through `label-raster.ts`,
  markup drivers translate it into their own tags.
- `label-raster.ts` — `rasterizeLayout(layout, dpi)`/`mmToPx(mm, dpi)`:
  draws a layout to a monochrome PNG with `@napi-rs/canvas`, thresholding
  every pixel to pure black or white because a thermal head has no grey.
  Registers the bundled fonts in `src/assets/fonts/` explicitly (Vercel has
  no usable system fonts), listing the CJK face after the Latin one so a
  Chinese customer name still prints.
- `connectors/` — the driver layer: `types.ts` holds the three driver
  interfaces (one per connector), `registry.ts` maps a driver id to its
  metadata. See its own README.
- `printers.ts` — `getPrinterByLocation`/`getPrinterByTokenHash`/
  `touchPrinterSeen`/`printerState`: reads of the `printers` table plus the
  one health signal every connector shares (`last_seen_at`, online inside
  60s, written at most once per 20s so a printer polling every few seconds
  does not write a row per request).
- `job-dispatch.ts` — `claimJob`/`sweepLocation`/`dispatchJob`: the job
  lifecycle beyond creation. `claimJob` wraps the `claim_job` SQL function,
  the only path from `queued` to `sent`. `sweepLocation` is the lazy,
  idempotent timeout pass (expiry and unconfirmed sends) run at the start of
  every pull and status read instead of a cron. `dispatchJob` pushes to the
  maker's cloud for `vendor_cloud` printers and is a no-op for the pull
  connectors, which wait for the device to ask.
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
