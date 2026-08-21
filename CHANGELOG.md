# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Bookings: deposit-now, balance-later checkout for event-cart vendors
  (weddings, private events), instead of a one-shot transaction. A new
  `bookings` table links up to two `transactions` rows (deposit, then
  later balance) by id; a Postgres trigger keeps `bookings.status`
  (`pending_deposit`→`deposit_paid`→`fully_paid`, or `cancelled`) correct
  off those transactions' own `confirmed` state, regardless of which path
  confirmed them. New `/dashboard/bookings` list + detail pages: a
  creation dialog, a "Create balance checkout" action once the deposit
  exists, cancel, and a "balance due soon/overdue" badge (dashboard-only —
  this repo has no cron/notification infra, so it's not a push).
- Dark mode is now actually reachable: a manual Light/Dark/System control
  in the dashboard account menu, via bumping `@merqo/ui` to v0.18.0
  (its `AccountMenu` gained a built-in theme control) and wrapping
  `src/app/layout.tsx` in `next-themes`' `ThemeProvider`. `globals.css`'s
  `.dark` block already existed but had no code path applying the `.dark`
  class, so it was fully unwired until now.

### Fixed

- The favicon/apple-touch-icon (`src/lib/brand-icon.tsx`) still rendered
  the old "Signal & Mint" hex after the Banknote Engrave rebrand — a
  real visible bug, not just stale docs.

### Changed

- Onboarding tour copy: no more em dashes, and two new steps
  (Transactions, Stats) covering ground the tour skipped before. The
  first step now shows an example transaction preview.

### Added

- Widened `admin_audit` coverage: a vendor's own refund (`issueRefundAction`)
  is now recorded, not just admin-console actions. New migration revokes
  `UPDATE`/`DELETE` on `admin_audit` from `service_role` (kept to
  `SELECT`/`INSERT`), closing a real tampering gap at zero functional cost.
  Retention (5 years, matching IRAS) now stated in `AGENTS.md`.

### Changed

- Brand theme: `globals.css`'s color tokens replaced with "Banknote
  Engrave" (engraved teal-green primary, steel-blue secondary), light
  and dark, across the full shadcn token set. Purely cosmetic — no
  component/behavior change.

### Fixed

- Bumped `@merqo/ui` to v0.14.1 — the kit-switcher (account menu's
  "Switch products") was sending vendors to a kit's `-sg.vercel.app`
  deployment host instead of its real `<kit>.merqo.io` domain, a
  different host from the shared-session cookie's `.merqo.io` scope —
  bouncing a switching vendor into a login loop instead of a live
  session.

### Added

- "Switch products" submenu in the dashboard account menu, letting a
  signed-in vendor jump to another live sibling kit's dashboard (qkit,
  loopkit, stockkit) — SSO via the shared `.merqo.io` cookie already signs
  them in there, this just adds the in-product navigation link. Bumped
  `@merqo/ui` to v0.13.0 for the new `switchKits` prop on
  `DashboardNav`/`AccountMenu`. Static v1 list, no new API call.
- Admin-tunable Pro pricing: a single-row `paykit.pricing` table, a `setPricing` admin action, and `@merqo/ui`'s new `PricingForm` wired into `/admin` let an admin change the Pro price live, no redeploy needed, seeded at $4.99/mo (up from the hardcoded $12/mo `PRO_PRICE` constant). Every price call site (plan page, dashboard nudge, landing copy) now reads the live price instead of a hardcoded string. In the same change, revenue stats become free for every vendor (previously Pro-gated) and refund tracking becomes Pro's one remaining gate. See `docs/superpowers/specs/2026-08-15-paykit-admin-pricing-design.md` and `docs/superpowers/specs/2026-08-15-paykit-pro-simplification-design.md`.
- BYO payment preset picker on the `pointer` config form
  (`src/app/dashboard/config/pointer-presets.ts`): four cards (Stripe
  Payment Link, HitPay Payment Link, PayLah! QR, Other/Custom), each
  with tailored "where to find this" instructions; Stripe and HitPay
  additionally get a soft, non-blocking warning if the pasted URL
  doesn't look like their expected link shape. UI/copy only — no new
  `vendor_payment_config` column, no PSP integration, free tier always.
  See `docs/superpowers/specs/2026-08-14-paykit-byo-preset-directory-design.md`.

### Changed

- Bumped `@merqo/ui` to v0.14.0 and switched the dashboard nav's
  `switchKits` prop to the new `getSwitchKits("paykit")` helper, replacing
  the locally hardcoded sibling-kit array. `@merqo/ui` now owns the
  canonical kit family list (`KIT_FAMILY`), so adding a future kit only
  requires updating `@merqo/ui`, not every kit's own `DashboardNav`
  wrapper. No behavior change — same three sibling kits, same URLs.
- Display font switched from Space Grotesk to Fraunces (the shared
  family display face — see
  `docs/business/2026-08-13-typography-family-standard.md`). qkit
  already used Fraunces; this brings paykit in line with the rest of the
  family now that cross-kit SSO means vendors move between kits under
  one identity, so a per-kit display face reads as a seam rather than a
  feature. Body (Inter) and mono (JetBrains Mono) fonts are unchanged.
  The brand-icon mark's font fallback also switched from the system
  sans-serif stack to the Georgia serif stand-in, matching Fraunces
  being a serif.
- Checkout now goes through a pluggable `PaymentProvider` seam
  (`src/lib/payments/provider.ts`) instead of calling the EMVCo/pointer
  builder (`renderCheckout`) directly. No behavior change today — the
  only registered provider is `direct`, which wraps the existing builder
  unchanged — but wiring in a future real payment gateway becomes a
  `PAYKIT_PROVIDER` config value plus one new provider implementation,
  not a route rewrite.

### Fixed

- `saveConfigAction` (`/dashboard/config`) used `.upsert()`, whose
  `ON CONFLICT DO UPDATE` path requires table-level `UPDATE` privilege
  regardless of column-level grants — but `vendor_payment_config`'s
  `UPDATE` grant is deliberately column-scoped to exclude `plan` (see
  `0001_paykit_core.sql`, so a vendor can't self-escalate to Pro). The
  result: every payment-config save failed with a silent "Could not
  save. Try again." — the core setup flow was completely broken for both
  first-time and repeat saves. Replaced the upsert with an explicit
  select-then-insert-or-update, which respects the same column grants
  as every other write in the app; no grant was widened.
- The revenue chart (`/dashboard/stats`) had no tooltip — hovering a bar
  showed nothing, so a vendor could only eyeball a day's revenue against
  the gridlines. Added a `recharts` `Tooltip` with a custom, card-styled
  content component showing the exact date, amount, and transaction count.
- The free-plan Stats page's "upgrade to see aggregated revenue…" copy
  had no way to act on it — "upgrade" was plain text, not a link. It now
  links to `/dashboard/plan`, matching the linked pattern already used in
  the dashboard home Pro nudge.
- Refund amount was entered in raw cents ("450" for $4.50) while
  every other money value in the app displays as SGD dollars — real
  error risk on an action that writes a refund ledger row. The
  refund dialog now takes a dollar amount and converts to cents
  before submit.
- `issueRefundAction` never revalidated the transactions page after
  inserting a refund, so the table kept showing the pre-refund state until
  a manual reload despite the toast confirming success. The refund dialog
  also stayed open with the submitted values still populated, inviting an
  accidental duplicate submit. Added `revalidatePath` and made the dialog
  close/reset on success.
- No `loading.tsx` or `error.tsx` existed anywhere in the app — navigation
  showed a blank screen until data resolved, and an unhandled throw fell
  through to Next's default unstyled error page. Added branded boundaries
  at the dashboard segment and root level.
- The revenue chart had no accessible name for screen readers. Added
  `role="img"`/`aria-label` and an sr-only data table.
- `GET /api/v1/vendors/{vendor_id}/config` now returns the full editable
  `vendor_payment_config` row (`kind`, `payee_name`, `uen`, `mobile`,
  `label`, `url`, `qr_image_url`) alongside the existing `has_config`/
  `display_name` summary fields, instead of the summary alone. Closes the
  gap where a calling kit's own "quick add PayNow details" edit form (e.g.
  qkit's) had every text field start blank when a vendor re-opened payment
  settings, since the kit had no way to read back what was already saved.
- Dashboard onboarding tour re-triggered on every visit to `/dashboard`
  despite #23's "stamp on start, not finish" fix. Root cause: that fix's
  mark-seen write is fire-and-forget from the client
  (`dashboard-tour.tsx`'s `onFirstSeen`), and the tour's own second step
  spotlights the real "Payment setup" nav link — which `@merqo/ui`'s
  `DashboardNav` renders as a plain `<a>` tag, not `next/link` — so
  clicking it (as the tour invites) triggers a hard page navigation that
  can abort the write before it lands, leaving `tour_seen_at` unset.
  `src/app/dashboard/page.tsx` now also stamps `tour_seen_at`
  synchronously during its own server render whenever it's unset — a
  write that lands before the response is even sent, immune to any
  client-side navigation race. `tour-actions.ts`'s `markTourSeen` is
  refactored to share the upsert (`stampTourSeen`) with `page.tsx` instead
  of duplicating it.

### Added

- `POST /api/v1/vendors/{vendor_id}/config` — kit-auth (bearer-secret,
  `verifyKitAuth`) service-role upsert of a vendor's
  `vendor_payment_config` on behalf of a calling kit, reusing
  `vendorPaymentConfigInputSchema` (paynow|pointer) for validation and
  returning the same summary shape as the existing `GET` route (`has_config`/
  `display_name`, plus the full config fields as of the fix above). First
  piece of the qkit→paykit checkout cutover: qkit was
  minted a `kit_api_keys` bearer secret so it can build a lightweight
  "quick add PayNow details" UI inside its own dashboard instead of
  redirecting to paykit's dashboard.
- `POST /api/v1/checkout/{id}/unclaim` — reverts a `claimed` transaction
  back to `pending` (undoes an accidental "I've paid" tap). Idempotent and
  provably safe: a `confirmed` transaction is never reverted — the
  `.eq("status", "claimed")` update guard means the DB simply matches
  nothing and the endpoint echoes the unchanged `confirmed` status back,
  same idempotent-no-error convention `claim`/`confirm` already use.
  Restores a capability qkit lost when it cut over from its own local
  `unclaimPayment` to paykit's HTTP API.

### Changed

- Design pass from a completed frontend-design/impeccable critique:
  claimed transactions now have a distinct visual state instead of
  looking identical to pending ones; dashboard home gained a
  payment-method summary card and a proper Pro-nudge card; the Pro
  badge and config-saved confirmation now use the brand mint token
  instead of stock Tailwind emerald; the revenue chart's bars use
  the mint accent and gained a total/count/average summary row;
  added the family's documented ink closing-CTA band (previously
  defined but unused) to the landing page; and a few smaller
  copy/consistency fixes (FAQ heading pattern, upgrade-CTA SLA note,
  softened "via qkit" checkout badge copy).
- Bumped `@merqo/ui` to v0.10.0 and wired its new optional `LinkComponent`
  prop with `next/link`'s `Link` at the `DashboardNav` call site
  (`src/app/dashboard/dashboard-nav.tsx`). `DashboardNav`/`AccountMenu`
  previously hardcoded plain `<a>` tags for internal nav links, forcing a
  full page reload on every click — the root cause PR #36 worked around
  with a server-side stamp. `DashboardNav` forwards `LinkComponent` down
  to the `AccountMenu` it composes internally, so passing it once here
  covers both; paykit has no standalone `AccountMenu` usage elsewhere.
- Bumped `@merqo/ui` to v0.9.0: `DashboardNav`'s inner row is now capped at
  `max-w-7xl`/centered (matches the content area it sits above — no code
  change needed here). `src/components/landing/nav.tsx` now composes the
  new `LandingNav` shell (sticky header, `max-w-6xl` row) instead of
  hand-rolling it; visual output is unchanged aside from the shared
  shell's own `end`-row gap (`gap-2 sm:gap-4`, replacing a fixed `gap-3`).
- Dashboard content width is now consistent across every `/dashboard`
  route: `src/app/dashboard/layout.tsx`'s `<main>` is the single
  layout-level `mx-auto w-full max-w-7xl` container (matching qkit's
  canonical dashboard width), replacing six pages that each set their own,
  different width (`max-w-lg` through `max-w-4xl`) with no shared outer
  boundary. Pages needing a narrower reading width (config's form,
  profile's two-column form, plan's card stack, stats' upsell/chart,
  transactions' table) keep an inner `mx-auto max-w-*` div, so content
  still reads at a sensible width — only the _outer_ edge, the one
  `DashboardNav` aligns to, is now consistent.
- Dashboard account chrome (nav, account menu, Feedback/Get-help sheets,
  profile-icon/QR-image uploader, onboarding tour, tooltip, and settings
  field-group shell) migrated onto the shared `@merqo/ui` v0.8.1 package
  — the same component library qkit adopted first. Local
  `FeedbackForm`/`SupportForm`/`InfoTooltip`/`Section`/`ImageUploader`/
  `tour.css` are deleted; `dashboard-nav.tsx`/`dashboard-tour.tsx`/
  `use-async-action.ts` are now thin paykit-specific wrappers around the
  shared components. No behavior, copy, schema, or payment-processing
  logic changed — UI-layer chrome only.
- Each of the six `/dashboard` page.tsx files (`page.tsx`,
  `config/page.tsx`, `plan/page.tsx`, `profile/page.tsx`,
  `stats/page.tsx`, `transactions/page.tsx`) now has a `page.dom.test.tsx`
  alongside it, following the "await the async server component, render
  its returned JSX with RTL" pattern `dashboard/layout.dom.test.tsx`
  established: session/plan/transaction lookups mocked, real branching
  (empty state, Free/Pro gating, nudge thresholds) asserted. These pages
  previously had no direct test coverage at all.

### Added

- `POST /api/v1/checkout` is now idempotent on `(kit_slug, order_ref)`: a
  retried call (e.g. after a caller-side timeout) returns the transaction
  the first call already created instead of erroring or creating a
  duplicate pending transaction (`0007_paykit_checkout_idempotency.sql`
  adds the unique constraint the route catches the violation on).
- Unit tests for `vendor-session.ts` (`getVendorSession`/`getVendorPlan`),
  the shared dashboard auth guard used by every `/dashboard` page and
  server action — previously covered only indirectly through whatever
  dashboard action tests happened to mock through it.
- A comment-hygiene enforcement layer alongside the existing static ESLint
  gate (`no-inline-comments`, `sonarjs/no-commented-code`): a feedback-only
  `PostToolUse` hook (`post-edit-comment-check.sh`), a warn-only pre-commit
  nudge (`comment-hygiene.sh`), and a CI job scoped to added lines — all
  reading the same `.claude/comment-hygiene-patterns.txt`.
- Merqo-team internal admin console (`/admin`), ported from loopkit's
  admin-console pattern: an `admins` allow-list + `admin_audit` trail
  (`0006_paykit_admin.sql`), an overview page with platform-wide stat
  tiles and a recent cross-vendor activity feed, and a vendors page
  listing every vendor with a plan toggle (`setVendorPlan`). Vendor
  identity is resolved via a new `listAllUsers` helper (paginates the
  Supabase admin API) since `vendor_payment_config.payee_name` is null
  for `kind='pointer'` rows.

### Changed

- `merqo-support.ts`, `merqo-vendor-feedback.ts`, and
  `merqo-vendor-profile.ts` now delegate their `.schema("merqo").rpc(...)`
  call to a new shared `callMerqoRpc` helper (`src/lib/merqo-rpc.ts`)
  instead of each hand-writing the same generic-over-caller's-client cast;
  public function signatures unchanged.
- Landing footer rebuilt to match qkit's exact single-row layout
  (wordmark, tagline, copyright, sign-in link as flex siblings), and the
  bottom call-to-action band above it removed — qkit's landing page never
  had one.

### Fixed

- `.claude/settings.json`'s `Edit` permissions-deny list now also covers
  `.env.*.local` (it already covered the other `.env` variants), matching
  the `Read` deny list.
- `/api/merqo/vendor-status` now paginates the Supabase admin-users
  lookup via `listAllUsers` instead of the old `merqo-auth.ts#listAllAuthUsers`
  (removed), which only ever read the first 1000 auth users — a vendor
  past that ceiling silently resolved as inactive/no-plan to merqo's
  lookup.
- Dashboard onboarding tour now stamps `tour_seen_at` as soon as it
  auto-runs, not when it finishes — a refresh mid-tour no longer makes
  it re-run on every dashboard load.

### Added

- First-visit dashboard onboarding tour (driver.js overlay + floating "?"
  replay button), ported from qkit/stockkit. Seen-state tracked in the new
  `vendor_prefs` table.
- Shared-session SSO across `*.merqo.io` kits: `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN`
  scopes the Supabase auth cookie to `.merqo.io` in production, so signing
  in on one kit signs you in on the rest. A one-time cleanup in
  `src/lib/supabase/middleware.ts` clears each already-signed-in vendor's
  pre-existing host-only cookie (forcing a single re-login) without
  clobbering a same-request token refresh.

### Fixed

- Dashboard nav desktop links now render as the shared `Button asChild
variant="ghost" size="sm"` control instead of a hand-rolled `Link`,
  matching every other kit's dashboard nav.
- Login page brought to cross-kit parity: card container standardized to
  the shared `ElevatedCard`, Google icon extracted into `google-mark.tsx`,
  and wordmark/field/button sizing and copy aligned with the other kits'
  login pages.
- Browser-tab title now uses the cross-kit "Name | Tagline" Title Case
  format: "Paykit | Vendor Payments" (was "paykit: PayNow payments").
- paykit supports both `paynow` and `pointer` (BYO QR/link) payment
  configs, so "PayNow payments" / "shared PayNow payment engine" undersold
  it — reworded to "Vendor Payments" / "shared vendor payment engine"
  (title, description, footer, AGENTS.md).
- `.husky/lib/pre-commit.sh` used `xargs -d '\n'`, a GNU-only flag not
  supported by BSD xargs (macOS default) — broke every local commit
  touching a staged .ts/.tsx/.js/.mjs/.cjs file. Swapped for portable
  `tr '\n' '\0' | xargs -0`.
- Landing and footer "Log in" links renamed to "Sign in" for label parity
  across all Merqo Business kits.
- Dashboard and landing navbar height, padding, and logo size now match
  qkit's spec (`px-5 py-3.5`/`py-4`, `text-3xl` logo).

- Browser-tab title lowercased to match the kit naming convention (was
  "PayKit", PascalCase reserved for the logo mark only) and given a tagline:
  "paykit: PayNow payments".
- Google OAuth on `/login` now forces an English consent screen
  (`queryParams: { hl: "en" }`), matching merqo/qkit/loopkit.

### Added

- Real "Forgot password?" flow on `/login` (sign-in mode only): emails a
  Supabase reset link via `resetPasswordForEmail`, landing on
  `/auth/callback` → `/dashboard/profile`'s existing "Change password"
  field. Toasts an error when the email field is empty or the call fails.
- A real, clickable Pro-upgrade action on the dashboard Plan page
  (`UpgradeCta`) — files an in-product request via the new
  `requestProUpgradeAction` server action instead of just describing the
  upgrade in text; no payment provider involved, Pro is granted manually.
- `BackButton` (`@/components/back-button`), ported from qkit: a real
  hit-target "leave this page" button, replacing the plain underlined
  `<Link>` previously used on the dashboard Plan and Profile pages.
- FAQ link in the landing nav (`landing/nav.tsx`), jumping to the existing
  `faq.tsx` section.
- Login card now uses the shared `Wordmark` (was plain "paykit" text) and a
  real Google "G" mark next to "Continue with Google" (was a bare label,
  no brand glyph).

### Fixed

- `SupportForm`'s category `ToggleGroup` was missing `spacing={1.5}`,
  rendering the category buttons edge-to-edge instead of qkit's
  separated-pill layout.
- Dashboard nav's mobile burger button appeared at the wrong breakpoint
  relative to the inline links, and the account-menu `TierBadge` pill was
  misrendered; both fixed alongside a `Button` sizing fix.
- Sign-up on `/login` no longer silently redirects to `/dashboard` when
  Supabase returns no session (email confirmation on) — it now shows a
  "Check your email" state, with "Back to sign in" returning to the normal
  form.
- templateCentral 5.12 harness sync: `docs/constitution.md` references in
  `.claude/settings.json` and `AGENTS.md` corrected to the canonical
  uppercase `docs/CONSTITUTION.md` casing (already used by
  `protect-files.sh`) so the ask-gate would actually fire if that file is
  ever added; removed the unused, unwired `.claude/hooks/verify.sh`; bumped
  `pnpm/action-setup` in CI from v4.3.0 to v4.4.0.

### Changed

- Migrated git hooks from lefthook to husky — lefthook's unsigned
  `lefthook.exe` is unconditionally blocked by Windows Smart App Control on
  this machine; husky has no native binary. Same checks, same rigor.
- `FeedbackForm`'s NPS score picker and comment field now use shadcn
  `ToggleGroup`/`Textarea` instead of hand-rolled radio buttons and a plain
  `<textarea>`, matching `SupportForm` and qkit's equivalent component. No
  behavior, copy, or schema change.

### Security

- Bumped `next` 16.2.10 → 16.2.11, clearing 9 known advisories (4 high: App
  Router middleware/proxy bypass, Server Actions DoS, Server Actions SSRF
  on custom servers, rewrites SSRF via attacker-controlled hostname; 5
  moderate: response-body cache confusion x2, unbounded Server Action
  payload on Edge, Image Optimization SVG DoS, internal Server Function
  endpoint disclosure) — all fixed upstream, no app code changes needed.

### Added

- `GET /api/merqo/vendor-status` and `POST /api/merqo/vendor-provision` —
  merqo hub integration routes, bearer-secured via new `MERQO_METRICS_SECRET`/
  `MERQO_PROVISION_SECRET` env vars. Both routes are read-only: paykit has no
  safe default for `vendor_payment_config`'s `payee_name`/`uen`/`mobile`
  fields, so provisioning only reports whether a vendor has already
  configured payment collection (`needs_setup: true/false`), never creates a
  placeholder row.
- **Real "Get help" support form**, replacing the mailto-link interim
  pattern — files into the shared cross-kit `merqo.support_messages`
  inbox (Merqo team picks it up in `/admin`), same pattern qkit's own
  local support form uses, now shared infrastructure any kit can call.

### Fixed

- Dashboard account menu was missing the dropdown chevron qkit/loopkit both
  show, and the nav wordmark used the generic (still shadcn-default,
  near-black) `--primary` token instead of paykit's own mint brand color
  already used everywhere else (landing wordmark, hero, icons).

### Docs

- Added the `src/lib/`, `src/lib/payments/`, `src/lib/supabase/`,
  `src/components/`, `src/components/landing/`, and `src/components/ui/`
  `README.md` files — previously bypassed via the `skip-readme-check`
  label on prior PRs that touched those folders.

### Changed

- `eslint.config.mjs` expanded from one hand-picked sonarjs rule to the
  plugin's full `sonarjs.configs.recommended` set (206 of 268 rules at
  `error`), with scoped overrides for generated shadcn primitives and
  test-fixture false positives. Fixed every real finding it surfaced: 4
  nested ternaries de-nested (display-string logic only, no behavior
  change) and 2 `concise-regex` simplifications.
- Code-debt sweep: `merqo-auth.ts`'s `bearerOk`/`provisionBearerOk` shared
  the same constant-time bearer-check logic twice; extracted into one
  `bearerMatches()` helper. The identical `formatCents()` currency
  formatter, previously copy-pasted in `admin/page.tsx`,
  `dashboard/stats/revenue-chart.tsx`, and
  `dashboard/transactions/transaction-table.tsx`, now lives once in
  `src/lib/utils.ts`. Removed `schemas.ts`'s `parseSocialLinks` — dead
  code with zero callers (the real `social_links` data flow reads
  straight from the merqo RPC response, never through this function).

### Security

- `vendorPaymentConfigInputSchema`'s pointer `url`/`qr_image_url` and
  `socialLinksSchema`'s social link fields validated only with
  `z.string().url()`, which accepts any scheme — `javascript:`, `data:`,
  `file:`, etc. The pointer `url` is later rendered as a real link both in
  the vendor's own dashboard and, via `/api/v1/checkout`'s `"link"`
  response type, in front of an end customer on whichever kit's checkout
  UI renders it. Added an `isHttpUrl()` refinement restricting all of
  these fields to `http:`/`https:` at the schema layer.
