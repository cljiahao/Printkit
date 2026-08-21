# paykit — Admin-Tunable Pricing: $4.99/mo — Design

**Date:** 2026-08-15
**Status:** Approved (design); plan to follow.

## Summary

paykit's Pro price is a source constant (`PRO_PRICE` in `src/lib/plan-view.ts`)
— changing it today means editing code and shipping a deploy. qkit solved
this already: a single-row `qkit.pricing` table an admin edits live from
`/admin`, read by the offer page with a zeroed fallback
(`DEFAULT_PRICING`) for the "row not readable yet" case. This spec ports
that pattern to paykit — one field (`monthly_cents`; paykit has no
day-pass concept, that stays qkit-only per the cross-kit pricing doc's own
decision) — and, in the same change, corrects the price itself from $4/mo
to **$4.99/mo**.

**Why $4.99, not $4.** Per
`Merqo Business/docs/business/2026-08-15-per-kit-pricing-rationale.md`
(this session's own pricing review, researched via live web search): paykit
never touches funds — no PSP integration, no settlement, no
per-transaction cost basis — so it was deliberately _not_ priced against
real payment processors, whose per-transaction fees reflect real
settlement/compliance cost paykit doesn't carry. No direct "payment
tracking middleware" comparator exists either; the closest applicable data
point is the general SaaS non-core-add-on convention, independently
researched this session at **$3-5/mo** (SSO-per-user add-ons,
time-tracking/bank-connection add-ons bundled into all-in-one small-business
platforms) — paykit's refund-tracking gate (its one remaining Pro feature,
per `2026-08-15-paykit-pro-simplification-design.md`) is exactly this
shape: a non-core bookkeeping add-on, not a core product. $4 already sat
inside that band; the correction is pure **charm pricing**, the family-wide
convention this same rationale doc confirms via qkit's own live price
($24.99/mo, $14.99/day) and the closest direct competitor (Tabao Us,
$7.90/$12.90) — round numbers are reserved for larger, quality-signaling
price points aimed at a bigger business segment, not the price-sensitive
SG hawker/home-based-F&B tier every Merqo kit targets. $4 was this
session's own first pass, set before that convention was confirmed against
qkit's live number; $4.99 is the correction, not a new argument.

**Sequencing note — two paykit changes, same file, same day.**
`2026-08-15-paykit-pro-simplification-design.md` (cuts Pro to a flat
$4/mo, moves stats to Free, leaves refund tracking as the one Pro gate) was
written earlier the same session and is approved with its own plan, not yet
implemented in live code as of this spec (`plan-view.ts` still reads
`PRO_PRICE = "$12/mo"`and the old stats-gated feature list). This spec
does **not** re-implement that scope — the free/pro feature list is out of
bounds here, untouched. What it does is delete`PRO_PRICE`entirely (the
constant simplification's own plan would otherwise set to`"$4/mo"`) and
replace it with a live DB read seeded at 499 cents. The two plans' diffs on
`plan-view.ts`mostly don't overlap (simplification touches`features`;
this touches `PRO_PRICE`/the function signature) but do share the file —
whichever implementation plan lands second should rebase on the first
rather than assume a clean parallel merge. See this spec's own plan's Task
0 for the concrete branch-order guidance.

## Guiding decisions (locked during brainstorming)

- **One field, not qkit's two.** paykit has no event-pass/day-pricing
  concept, so `@merqo/ui`'s new field-list-driven `PricingForm` (built this
  same session — see
  `Merqo Business/merqo-ui/docs/superpowers/plans/2026-08-15-pricing-form.md`)
  is configured with exactly one field: `{ key: "monthly_cents", label: "Monthly (SGD)" }`.
- **Reuse the shared `@merqo/ui` component, don't hand-roll paykit's own.**
  paykit is the first real adopter of the new generalized `PricingForm`
  (qkit's own migration onto it is explicitly out of scope of that
  component's plan — qkit keeps its bespoke 2-field form for now). The
  component is presentational only (cents in, cents out, no `toast`
  import inside it); paykit's own `onSave`/`onError` wiring supplies the
  Supabase write and the `sonner` toast, matching the toast convention
  every other paykit form already uses (`profile-form.tsx`,
  `upgrade-cta.tsx`).
- **`paykit.pricing` mirrors `qkit.pricing`'s shape, minus the event-pass
  column.** Single row, `id` pinned to 1, public-read RLS policy (the
  price is shown on the anonymous landing page, not just behind auth — it
  isn't secret), writes only through the service-role admin action.
- **A shared `getPricing(supabase)` helper, not qkit's per-page duplicated
  query.** qkit inlines the same `.from("pricing").select(...)` call
  separately in its admin page and its dashboard plan page. paykit centralizes
  that one query in `src/lib/pricing.ts`, parameterized over either the
  cookie client (dashboard/landing reads — public-select policy covers
  both) or the service-role client (admin read) — a deliberate small
  improvement over the reference implementation, not a deviation qkit
  itself needs to adopt as part of this change.
- **Admin action schema stays inline in `actions.ts`, not centralized in
  `lib/schemas.ts`.** qkit centralizes `pricingFormSchema` in
  `lib/schemas.ts`; paykit's own `actions.ts` already keeps its one
  existing admin schema (`setVendorPlanSchema`) inline, not in
  `schemas.ts` (`schemas.ts` today holds only vendor-facing form/API
  schemas). `setPricing`'s schema follows paykit's own established
  convention, not qkit's — a conscious divergence, not an oversight.
- **No `MAX_MONEY_CENTS` constant exists in paykit today** (unlike qkit).
  A local sanity bound (100,000 cents = $1,000) is defined in `actions.ts`
  next to the new schema — no monthly SaaS price here should plausibly
  exceed that.
- **Every "$4/mo" (and stray "$12/mo", wherever
  `2026-08-15-paykit-pro-simplification` hasn't already landed) becomes
  either a live-formatted value (`formatCents(monthly_cents)}/mo`) or,
  in prose docs (AGENTS.md, READMEs), a description of the mechanism
  ("admin-tunable via `/admin`, seeded at $4.99/mo") instead of a literal
  hardcoded number that can silently drift from whatever an admin sets
  later.**
- **Cross-repo dependency: `@merqo/ui` v0.12.0 must exist before this
  ships.** paykit currently pins `"@merqo/ui": "github:cljiahao/merqo-ui#v0.11.1"`
  (`package.json`) — `PricingForm` isn't in that tag. This plan cannot
  start its admin-wiring task until the `merqo-ui` `PricingForm` plan's own
  Task 2 (version bump/tag) has actually shipped a tag containing it.

## What changes

### `supabase/migrations/0008_paykit_pricing.sql` (new)

A single-row `paykit.pricing` table — `id int primary key default 1 check
(id = 1)`, `monthly_cents int not null default 0`, `currency text not null
default 'SGD'`, `updated_at timestamptz`. Seeded `(1, 499)` — $4.99. RLS
enabled with one `for select using (true)` policy (public read, matching
qkit's `pricing_public_select`); no write policy — writes are service-role
only, through `setPricing`. `src/lib/types.ts`'s `Database["paykit"]["Tables"]`
gains a matching `pricing` entry (Row/Insert/Update), per AGENTS.md's rule
to update both the migration and the generated-type mirror together.

### `src/lib/pricing.ts` (new)

`PricingConfig` type (`{ monthly_cents: number; currency: string }`),
`DEFAULT_PRICING` (zeroed fallback for the pre-migration/unreadable-row
case, matching qkit's own `DEFAULT_PRICING` precedent), and `getPricing(supabase)`
— the one shared read, reused by the admin page, both dashboard pages, and
the landing page (see Guiding decisions).

### `src/app/admin/actions.ts`

New `setPricing` Server Action: `requireAdmin()` gate, an inline Zod
schema (`monthly_cents: z.number().int().nonnegative().max(100_000)`),
service-role update of the single `pricing` row (`eq("id", 1)`), a
`recordAudit` call (`action: "set_pricing"`, reusing the existing
`recordAudit` helper already in this file), and `revalidatePath` on every
route that displays the price (`/admin`, `/dashboard`, `/dashboard/plan`,
`/`).

### `src/app/admin/pricing-section.tsx` (new)

A thin client wrapper around `@merqo/ui`'s `PricingForm`: supplies the
one-field `fields` config, converts the initial `PricingConfig` into the
component's `{ values, currency }` shape, and implements `onSave`/`onError`
— `onSave` calls `setPricing`, throws on `{ success: false }` (so the
component's own `onError` path fires, per its documented contract — no
`try/catch` needed here, the thrown rejection _is_ the signal), toasts
success and `router.refresh()`s on the resolved path.

### `src/lib/admin-data.ts`

New `getAdminPricing()`, following this file's existing pattern
(`platformTotals`, `recentActivity`, `listVendors` — each opens its own
service-role client): calls `getPricing` against a fresh
`createServiceClient()`.

### `src/app/admin/page.tsx`

Adds `getAdminPricing()` to the existing `Promise.all`, and a new
"Pricing" section (matching the existing section-header pattern already
used for "Recent activity across all vendors") rendering
`<PricingSection initial={pricing} />`.

### `src/lib/plan-view.ts`

`PRO_PRICE` is deleted. `resolvePlanView` gains a third parameter,
`monthlyCents: number`, and `PlanView` gains `proPriceLabel: string`
(`` `${formatCents(monthlyCents)}/mo` ``) — computed once, in the one
existing pure/testable module, rather than each call site importing
`formatCents` and a raw cents value separately. (The `features` list
itself is untouched here — that's `pro-simplification`'s scope, not
this spec's.)

### `src/app/dashboard/plan/page.tsx`

Fetches `getPricing(supabase)` alongside its existing `getVendorPlan`/
`txCountThisMonth` calls, passes `pricing.monthly_cents` into
`resolvePlanView`, and replaces both existing `{PRO_PRICE}` interpolations
with `{view.proPriceLabel}`. The `PRO_PRICE` import is removed.

### `src/app/dashboard/page.tsx`

This page's nudge paragraph doesn't route through `resolvePlanView` today
(it calls `shouldNudgePro` directly) — it gains its own `getPricing(supabase)`
call (added to the page's existing `Promise.all`) and formats
`` `${formatCents(pricing.monthly_cents)}/mo` `` inline, replacing the
literal `"$12/mo"` (or `"$4/mo"`, whichever `pro-simplification` has left
in place by the time this lands).

### `src/app/page.tsx`, `src/components/landing/benefits.tsx`, `src/components/landing/faq.tsx`

`HomePage` (`src/app/page.tsx`) already creates a `createServerClient()`
for the auth check — this adds one more `getPricing(supabase)` call
alongside it, formats `monthlyPriceLabel` once, and passes it down as a
prop to both `<Benefits monthlyPriceLabel={...} />` and
`<Faq monthlyPriceLabel={...} />` (avoiding two more duplicate queries in
components that are otherwise presentational). Both components change from
parameterless to taking `{ monthlyPriceLabel: string }`; `faq.tsx`'s `FAQ`
array moves from module scope into the component body so its "What does
the free plan include?" answer can interpolate the live price.

### `AGENTS.md`

Data model section gains a `pricing` line (single-row, admin-tunable via
`/admin`, mirrors `qkit.pricing`'s shape minus the event-pass column). The
`plan` line's price reference (however `pro-simplification` has left it —
literal `$4/mo` or still `$12/mo`) is corrected to describe the mechanism,
not a hardcoded figure: "Pro price is admin-tunable via `/admin` (seeded
at $4.99/mo) — see `paykit.pricing`". File Layout section gains
`src/lib/pricing.ts` and `src/app/admin/pricing-section.tsx`.

### `docs/superpowers/specs/README.md`, `docs/superpowers/plans/README.md`

One-line Contents entries for this spec and its matching plan, in this
repo's existing bullet style (title + one real sentence, not a filename
restatement).

## Testing

- `src/lib/plan-view.test.ts`: the `PRO_PRICE` describe block is deleted;
  every `resolvePlanView(...)` call gains a third `monthlyCents` argument;
  a new assertion covers `proPriceLabel` (e.g. `resolvePlanView("free", 0, 499).proPriceLabel === "$4.99/mo"`).
- `src/app/admin/actions.test.ts`: a new `describe("setPricing", ...)`
  block mirrors the existing `setVendorPlan` suite's shape (admin-gate
  404, invalid-input rejection, success + audit row, update-failure
  path).
- `src/app/admin/admin-overview-page.dom.test.tsx`: the `@/lib/admin-data`
  mock gains `getAdminPricing`; a new assertion confirms the Pricing
  section renders the seeded value.
- New `src/app/admin/pricing-section.dom.test.tsx`: renders with a seeded
  `initial`, submits a new value, asserts `setPricing` was called with the
  right cents and a success toast fired; asserts an error toast fires when
  `setPricing` returns `{ success: false }`.
- `src/app/dashboard/plan/page.dom.test.tsx`, `src/app/dashboard/page.dom.test.tsx`:
  add a `getPricing`/pricing-row mock (or extend whatever Supabase mock
  each test already builds) so nudge/upgrade-copy assertions can check for
  `"$4.99/mo"` instead of a literal string baked into the page.
- `src/components/landing/*.test.tsx` (if any exist covering `benefits.tsx`/`faq.tsx`
  copy): updated for the new `monthlyPriceLabel` prop.

## Self-review

- No placeholders/TBDs — the $4.99 figure, the table shape, and every call
  site are stated decisions, not left open.
- Internally consistent: every consumer of the old `PRO_PRICE` constant is
  listed and given its replacement; no file is left importing a symbol
  this spec deletes.
- Scope: pricing-mechanism change only (constant → live DB read) plus the
  $4→$4.99 correction. No new plan tier, no schema change beyond the one
  new table, no touch to the free/pro feature-gate logic
  (`pro-simplification`'s scope, explicitly out of bounds here).
- Sequencing risk named explicitly, not silently assumed away: this spec
  depends on an unreleased `@merqo/ui` tag and shares a file
  (`plan-view.ts`) with an approved-but-unshipped sibling spec — both are
  called out above and in the matching plan's Task 0/Global Constraints,
  not discovered mid-implementation.
- Known follow-up, deliberately not done here: the cross-repo
  `Merqo Business/docs/business/2026-07-30-cross-kit-pricing-and-billing-plan.md`
  still needs its paykit row corrected to $4.99 once both this and
  `pro-simplification` have shipped (that doc's own sync task belongs to
  `pro-simplification`'s plan, Task 5, which predates this spec and
  already flags the same file — re-flagged here rather than silently
  assuming Task 5 already used the final $4.99 number, since it was
  written against $4).

## Parent

[specs](README.md)
