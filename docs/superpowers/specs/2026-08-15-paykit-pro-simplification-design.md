# paykit — Pro Simplification: $4/mo, Refunds-Only — Design

**Date:** 2026-08-15
**Status:** Approved (design); plan to follow.

## Summary

Today's Pro gate ($12/mo) bundles two unrelated things: the stats/revenue
chart and refund tracking. Two earlier drafts of a cheaper fallback tier
were considered and rejected this same session — see "History" below —
before landing on the real fix: **paykit doesn't need a second paid tier
at all.** It needs one, priced honestly for what it actually does.

**What paykit actually is, restated plainly:** a place to track
transactions, help a vendor reconcile/refund them, and let every kit
integrate with one shared checkout — not a payment processor, no PSP
integration of its own, no funds ever pass through it. Given that, $12/mo
for "stats + refunds" overprices what's a thin, genuinely useful but
non-differentiated feature set. This spec:

1. Cuts Pro to a single **$4/mo** price (was $12/mo). No second tier.
2. Moves the **stats/revenue chart to Free** — it's a view over data
   (transaction history) that's already free to see raw; gating the chart
   but not the underlying rows never made much sense.
3. Leaves **transaction tracking exactly as it already is: fully free**,
   confirmed by re-reading the current code (`transactions/page.tsx` has no
   plan gate at all) — this spec makes no change here, just documents it
   accurately, correcting AGENTS.md's current data-model line, which still
   implies stats+refunds are the only differentiators without confirming
   tracking itself was always ungated.
4. Leaves Pro's one remaining real gate as **refund tracking** — a
   bookkeeping feature that applies to every vendor regardless of which
   payment method (PayNow QR or BYO link) they use.
5. Documents, but does **not** build, a real auto-verify feature as a
   _future_ Pro perk — researched this session and found it can only ever
   cover vendors on the BYO-PSP path (Stripe/HitPay webhooks exist);
   PayNow-QR vendors (the free, default path — likely most vendors) have no
   generic webhook path available without a real bank business-API
   relationship. Because it can't cover most vendors, it can't be the
   _only_ thing Pro sells — it stays a future addition on top of refunds,
   not a replacement for them. Still correctly deferred (paykit's own T3),
   no code changes in this spec.

### History — two rejected drafts, same session

1. **Usage-based fallback ($0.24/confirmed transaction).** Rejected:
   paykit never touches funds and bears no real per-transaction cost, so a
   usage fee would misleadingly read as paykit taking a cut of the
   payment — stacked on top of whatever cut a vendor's own BYO PSP already
   takes on the same transaction.
2. **Flat two-tier split (`lite` $4/mo / `pro` $12/mo, identical
   features).** Rejected on the direct question "why are we gating paykit
   with a fee at all, given it's not a payment service" — having two paid
   tiers with _identical_ features was already a design smell (nothing
   distinguishes them except price, so nothing justifies picking the more
   expensive one), and re-examining what Pro's $12/mo actually buys found
   it thin enough that the honest fix was a single lower price, not a
   second tier.

## Guiding decisions (locked during brainstorming)

- **One paid tier, not two.** `VendorPlan` stays exactly `"free" | "pro"` —
  no schema change, no migration, no RLS change. This spec is pure pricing
  - feature-gate correction, not new infrastructure.
- **$4/mo, chosen to match the price this session already validated** via
  the rejected `lite` draft's own reasoning (a flat third of the old
  $12/mo, cheap enough to be a genuine low-commitment price for a utility
  tool) — reused here as Pro's actual price instead of a second tier's
  price.
- **Stats moves to Free.** A vendor can already see every transaction's
  amount/status/date for free (`transactions/page.tsx`); gating only the
  aggregated _view_ of the same data one click away never added real
  friction, just an inconsistency between the raw and the summarized form
  of the same information.
- **Refunds stays the one Pro gate.** It's the one feature here that's
  genuinely separate work (a ledger row, an admin-audited action) rather
  than a different view of data already shown for free — and it applies
  identically to every vendor regardless of payment method, unlike a
  verification feature would.
- **Auto-verify is named as a roadmap item, not built.** Documented so the
  BYO-PSP-only coverage gap is on record before anyone designs pricing
  around it later; no code in this spec implements it.
- **Marketing copy must match the code** (same rule the freemium-redesign
  spec established) — `benefits.tsx`/`faq.tsx` both currently say "$12/mo"
  and "revenue stats and refund tracking" as Pro's gate; both get
  corrected to "$4/mo" and "refund tracking" only.

## What changes

### `src/lib/plan-view.ts`

```ts
export const PRO_PRICE = "$4/mo";
```

`resolvePlanView`'s `features` list changes from a free/pro split that
included stats on the Pro side to: stats is now in _both_ lists (it's no
longer a differentiator), Pro's list adds only refund tracking:

```ts
features: isPro
  ? ["Unlimited transactions", "Revenue stats", "Refund tracking"]
  : ["Unlimited transactions", "Revenue stats"],
```

### `src/app/dashboard/stats/page.tsx`

Delete the `if (config?.plan !== "pro")` upsell branch entirely. The chart
renders unconditionally for every signed-in vendor — `getVendorPlan` is no
longer needed in this file at all (nothing else in the component reads
`config`).

### `src/app/dashboard/page.tsx` and `src/app/dashboard/plan/page.tsx`

Both currently render the nudge copy `"...Pro adds stats and refund
tracking, $12/mo."`. Both change to `"...Pro adds refund tracking,
$4/mo."` — dropping "stats" (no longer Pro-exclusive) and the price.

### `src/components/landing/benefits.tsx`

The "Free while you're small" tile's copy changes from _"Pro adds revenue
stats and refund tracking — $12/mo..."_ to _"Pro adds refund tracking —
$4/mo, once you're doing enough volume to want it."_ Revenue stats moves
into the Free description implicitly (already covered by "Unlimited
transactions" plus the now-free stats page — no separate copy line needed
for it, since it was never a stated benefits-tile feature on its own).

### `src/components/landing/faq.tsx`

_"What does the free plan include?"_ answer changes from _"Unlimited
transactions on the free plan, no cap. Pro adds revenue stats and refund
tracking."_ to _"Unlimited transactions and revenue stats on the free
plan, no cap. Pro adds refund tracking, $4/mo."_

### `AGENTS.md`

Data model section's `plan` line updates from `plan (free|pro) gates
Pro-exclusive features (stats, refunds) only — no transaction-volume cap;
Free tier checkout is unlimited` to `plan (free|pro) gates refund tracking
only ($4/mo) — transaction history and revenue stats are both free;
Free tier checkout is unlimited, no transaction-volume cap`. Also corrects
an unrelated stale trailing note in "Project-Specific Notes" that still
says qkit's checkout flow "has not yet been switched over to `POST
/api/v1/checkout`" — contradicted by this same file's own top section,
which already says the cutover completed 2026-08-15. Caught while in this
file for this spec; fixed alongside since it's a one-line factual
correction, not new scope.

### `src/app/dashboard/stats/README.md`

Purpose line changes from "Pro only — Free vendors see an upsell instead of
the chart" to describe the chart as available to every vendor; the
Contents section's `page.tsx` bullet drops the Free/Pro branch description
entirely (there's only one branch now).

### `src/app/dashboard/plan/README.md`

Purpose line's "$12/mo" references (if any survive Task-by-task review)
correct to "$4/mo"; "stats + Pro's" phrasing corrected to describe refunds
as the one gate.

### Historical docs — not edited

`2026-07-22-paykit-freemium-nudge-redesign-design.md` and
`2026-08-15-paykit-lite-tier-design.md` (this session's own rejected
draft, kept in git history via this repo's normal commit log even though
the draft file itself was deleted before being committed — see this spec's
"History" section for the record instead) stay untouched; this doc is the
record of what actually shipped.

### `Merqo Business/docs/business/2026-07-30-cross-kit-pricing-and-billing-plan.md`

Cross-repo doc, not part of this repo's own diff — paykit's row in the
per-kit pricing table updates from "$7/mo (down from the $12 already live
in copy — needs a copy update)" to "$4/mo (this session's actual shipped
price, not the $7 this doc previously proposed but never shipped)", and
the standalone-sum/bundle-discount math is recomputed against the real
$4/mo instead of the never-shipped $7. Tracked as a follow-up edit in the
implementation plan's own task list, not this repo's PR.

## Testing

- `src/lib/plan-view.test.ts`: `PRO_PRICE` assertion updates to `"$4/mo"`;
  `features` test updates — stats appears in both free and pro lists,
  refund tracking only in pro's.
- `src/app/dashboard/stats/page.dom.test.tsx`: delete the Free-tier upsell
  test; add a test proving a Free vendor sees the real chart (same
  assertions the old Pro-branch test used, now unconditional).
- `src/app/dashboard/page.dom.test.tsx` / `plan/page.dom.test.tsx`: update
  nudge-copy assertions from "$12/mo"/"stats and refund tracking" to
  "$4/mo"/"refund tracking".
- `src/components/landing/*.test.tsx` (if any snapshot/text-assertion
  coverage exists on the edited copy): update to match the new strings.

## Self-review

- No placeholders/TBDs — $4/mo and the stats-to-free move are both stated
  decisions with reasoning, not left open.
- Internally consistent: every file listed operates on the same "Pro =
  refunds only, $4/mo" model; no code path still checks plan to gate the
  stats page after this ships.
- Scope: pricing/feature-gate correction only. No schema/migration/RLS
  change (plan stays a 2-value type), no checkout-path change, no
  auto-verify implementation — that stays a named, deferred roadmap item.
- Ambiguity check: the two rejected drafts are documented with their
  specific rejection reasons (not silently dropped), and the auto-verify
  BYO-PSP-only coverage gap is stated explicitly rather than left as an
  assumption future work might miss.

## Parent

[specs](README.md)
