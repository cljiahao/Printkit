# lib

## Purpose

Framework-agnostic logic: Zod schemas, DB/RPC access, pure transition
functions, and shared types. Two subfolders (`payments/`, `supabase/`) group
larger clusters; everything else sits flat here.

## Contents

- `types.ts` — hand-maintained DB types (`Transaction`, `VendorPaymentConfig`,
  `TxStatus`, `VendorPlan`, `PaymentConfigKind`, `Booking`, `BookingStatus`,
  `SocialLinks`, …), kept in sync with `supabase/migrations/` by hand.
- `schemas.ts` — Zod input schemas for every form/action boundary:
  `vendorPaymentConfigInputSchema` (discriminated union over `kind`,
  paynow/pointer), `issueRefundInputSchema`, `createBookingInputSchema`
  (deposit + balance must add up to the total; balance due date must be on
  or before the event date), `cancelBookingInputSchema`,
  `createBalanceCheckoutInputSchema`, profile/password/social-links
  schemas, `feedbackSchema`, `supportMessageSchema` +
  `SUPPORT_CATEGORY_LABELS`.
- `api-schemas.ts` — Zod contracts for the `/api/v1/*` HTTP surface
  (request bodies, discriminated response shapes) plus the shared
  `uuidSchema` path-param validator.
- `tx-state.ts` — pure `claimTransition`/`unclaimTransition`/
  `confirmTransition`: the pending→claimed→confirmed state machine, plus
  the claimed→pending undo. All three are idempotent by design (a no-op
  success on states they don't apply to); `unclaimTransition` only ever
  reverts `claimed`, so a `confirmed` payment can never be un-confirmed.
- `transactions.ts` — `listTransactions(vendorId)`/`getTransaction(vendorId,
id)`: read a vendor's transactions (or one, by id) via the session-scoped
  Supabase client (RLS-filtered).
- `checkout.ts` — `createCheckout({vendorId, kitSlug, orderRef,
amountCents})`: the one `transactions`-insert-plus-render-the-checkout-view
  path, extracted out of `POST /api/v1/checkout`'s route handler so the
  dashboard's own booking deposit/balance actions
  (`dashboard/bookings/actions.ts`, `kitSlug: "paykit"`) can call it directly
  instead of going back through HTTP. Same idempotency (unique-constraint
  retry re-read) and error handling either caller gets.
- `bookings.ts` — `listBookings(vendorId)`/`getBooking(vendorId, id)`: read
  a vendor's bookings via the session-scoped Supabase client, same shape as
  `transactions.ts`.
- `booking-status.ts` — `balanceDueBadge(status, balanceDueDate, now?)`:
  pure — only ever non-null once a booking is `deposit_paid`, returning a
  `{label, urgency: "due-soon"|"overdue"}` once the balance is within 14
  days of due or already past it. This is the whole V1 "reminder" — no
  cron/notification infra exists in this repo (see `AGENTS.md`), so it's a
  dashboard badge computed at render time, not a push.
- `revenue-report.ts` — `aggregateRevenueByDay`: pure aggregation of
  confirmed transactions into per-day totals + counts (`DailyRevenue`:
  `{date, cents, count}`) for the Stats page's chart and its stat-tile row.
- `usage.ts` — `shouldNudgePro`/`PRO_NUDGE_THRESHOLD`: friction-based
  Free→Pro nudge (not a hard cap — Free tier has no transaction-volume
  cap, see root `AGENTS.md`).
- `plan-view.ts` — `resolvePlanView(plan, countThisMonth, monthlyCents)`:
  pure view-model for the dashboard Plan page (feature list — revenue
  stats free for everyone, refund tracking Pro-only — transaction-count
  copy, `shouldNudgePro`-backed nudge visibility, upgrade-CTA visibility,
  and `proPriceLabel` formatted from the live `monthlyCents`) — kept out of
  `plan/page.tsx`'s JSX so the free/pro branching is unit-testable without
  rendering that async server component.
- `pricing.ts` — `PricingConfig`, `DEFAULT_PRICING` (zeroed fallback), and
  `getPricing(supabase)`: the one shared read of the single admin-tunable
  `pricing` row (`id = 1`), reused by the admin console, both dashboard
  pages, and the landing page. Accepts either the cookie client (public-read
  policy) or the service-role client (admin read) — both are structurally
  the same generated client type.
- `kit-auth.ts` — `hashApiKey`/`verifyKitAuth`: bearer-secret verification
  for calling kits, checked on every `/api/v1/*` route before any DB access.
- `tour-prefs.ts` — `stampTourSeen(supabase, vendorId)`: upserts
  `vendor_prefs.tour_seen_at = now()`. A plain (non-`"use server"`) module
  so `src/app/dashboard/page.tsx` can call it directly during its own
  server render — the durable half of the onboarding-tour "stamp on
  start" fix, since the client-fired path
  (`src/app/dashboard/tour-actions.ts`'s `markTourSeen`, which also
  delegates here) is fire-and-forget and can be aborted by a hard
  navigation before it lands.
- `vendor-session.ts` — `getVendorSession()` (dashboard auth guard,
  redirects to `/login` on no session) and `getVendorPlan()`. Deliberately
  **not** used by Sheet-embedded server actions (`feedback.ts`,
  `support.ts` in `src/app/actions/`) — see that folder's README for why.
- `admin.ts` — `isAdmin(userId)` (presence of a row in `admins`, RLS-gated)
  and `requireAdmin()`: the `/admin` route/Server-Action gate, 404ing signed-
  out and non-admin callers alike so the route's existence is never revealed.
- `admin-data.ts` — `platformTotals()`, `recentActivity(limit)`,
  `listVendors()`, `getAdminPricing()`: service-role, cross-vendor reads for
  the admin console (RLS-exempt by design — the console spans every
  vendor). Vendor identity is resolved to email via `listAllUsers()`, since
  `payee_name` is null for `kind='pointer'` config rows. `getAdminPricing`
  is a thin `getPricing` (`@/lib/pricing`) call against a fresh
  service-role client.
- `list-all-users.ts` — `listAllUsers(supabase)`: paginates
  `supabase.auth.admin.listUsers()` (1000/page, capped at 50 pages) so a
  lookup doesn't silently drop vendors past the first 1000 auth users. Ported
  from loopkit's identically-named helper; also used by
  `/api/merqo/vendor-status`, replacing that route's old page-1-only
  `merqo-auth.ts#listAllAuthUsers` (removed).
- `merqo-rpc.ts` — `callMerqoRpc<FnName, Args, Returns>(supabase, fnName,
args)`: the shared generic-over-caller's-`Db`/`SchemaName` cast +
  `.schema("merqo").rpc(fnName, args)` call + thrown-`Error`-on-failure
  body that `merqo-vendor-profile.ts`, `merqo-support.ts`, and
  `merqo-vendor-feedback.ts` all delegate to, so that pattern is written
  once instead of hand-copied per RPC.
- `merqo-vendor-profile.ts` — `getOrCreateVendorProfile`/
  `upsertVendorProfile`, each a thin `callMerqoRpc` call with its own Zod-
  adjacent Args/Returns types, for the shared `merqo.vendor_profile` table
  (stall name, social links) — get/upsert via `merqo`'s `SECURITY DEFINER`
  functions, never a direct cross-schema table query.
- `merqo-auth.ts` — `bearerOk`/`provisionBearerOk` (constant-time bearer-secret
  checks against `MERQO_METRICS_SECRET`/`MERQO_PROVISION_SECRET` respectively),
  for the `/api/merqo/*` routes merqo hub calls directly — a separate auth
  mechanism from `kit-auth.ts`'s `verifyKitAuth` (which is for peer-kit-to-kit
  calls like checkout verification, keyed by `kit_api_keys`).
- `merqo-support.ts` — `submitSupportMessage`, a thin `callMerqoRpc` call
  for `merqo.submit_support_message` (the shared cross-kit Get-help inbox,
  `kit_slug: "paykit"`).
- `merqo-vendor-feedback.ts` — `submitVendorFeedback`, a thin `callMerqoRpc`
  call for `merqo.submit_vendor_feedback` (the shared cross-kit NPS/feedback
  channel, `p_kit_slug: "paykit"`).
- `merqo-vendor-status.ts` — `resolveVendorStatus(email, authUsers,
configs)`: pure two-step lookup (email → auth user → that user's
  `vendor_payment_config`) since `vendor_payment_config` has no email
  column. Ported from qkit's identically-named function. Backs
  `GET /api/merqo/vendor-status`.
- `brand-icon.tsx` — `brandIcon(size)` + `BRAND_MINT`/`BRAND_INK`: the
  paykit "P" mark as a `ReactElement` for `ImageResponse`-generated icons
  (favicon, apple-touch) — hex literals, not theme tokens, since
  `ImageResponse` needs concrete CSS colors. Tracks the "Banknote
  Engrave" theme (as of 2026-08-19) via the dark theme's brighter
  primary, so the dark-ink text on top stays legible.
- `action-result.ts` — `ActionResult<T>`: the discriminated
  `{success:true,...T} | {success:false,error}` shape every Server Action
  returns.
- `env.ts` — `publicEnv`: required-env-var accessors that throw at import
  time if unset, instead of silently reading `undefined`.
- `image-resize.ts` — `resizeToWebp`: client-side (Canvas, browser-only)
  resize + WebP encode before upload; passed as `@merqo/ui`'s
  `ImageUploader`'s `resizeImage` prop.
- `image-upload-adapter.ts` — `uploadPaykitImage`: paykit's `onUpload`
  adapter for `@merqo/ui`'s `ImageUploader` (2026-08-05 `@merqo/ui`
  migration) — takes the `{bucket, path, blob, contentType}` payload
  `ImageUploader` builds internally, writes it via the browser Supabase
  client's Storage API, and returns the public URL. Used at both call
  sites: `dashboard/profile/profile-form.tsx` (avatar) and
  `dashboard/config/payment-config-form.tsx` (BYO QR image).
- `utils.ts` — `cn()` (clsx + tailwind-merge), shared form label/error
  Tailwind class constants, `formatCents()` (integer cents -> SGD currency
  string), and `formatDate()` (a `date`-column "YYYY-MM-DD" string ->
  display date, parsed/formatted with an explicit UTC anchor so it never
  shifts by a day depending on the server's runtime timezone).

## Connectivity

Consumed throughout `src/app/` (route handlers, Server Actions, dashboard
pages) and `src/components/`. `payments/` and `supabase/` are the two
subfolders with their own concerns — see their READMEs.

## Parent

[paykit](../../README.md)
