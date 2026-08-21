# paykit — Freemium Redesign: Nudge, Not Block — Design

**Date:** 2026-07-22
**Status:** Approved (design); plan to follow.

## Summary

paykit's Free tier today hard-blocks checkout at 100 transactions/month —
`POST /api/v1/checkout` returns `402` and the customer literally cannot pay
once a vendor crosses that line mid-month. This contradicts the platform's
own documented philosophy: `Merqo Business/docs/business/2026-07-17-vendor-
expansion-and-integrations-strategy.md` names the intended model by example
— _"50+ manual payment confirms → here's the Pro auto-verify"_ — a nudge at
the point something gets tedious, not a wall that stops revenue. qkit's own
Free-tier precedent (`qkit/src/lib/plan.ts`) backs this too: its caps are
either setup-time limits (1 booth, 6 menu items) or automation conveniences
(`autoCloseHours`, `stockCaps` — Pro removes manual toggling, never blocks
the store from operating). Nowhere in the existing ecosystem does a kit stop
an in-flight sale from completing because a vendor got busy.

This spec removes paykit's hard transaction cap. Free tier PayNow
manual-confirm checkout becomes unlimited, forever, at any volume. Pro
remains a real upgrade (reports, refund tracking, $12/mo — unchanged), but
the Free→Pro nudge becomes informational, not a checkout failure.

**Out of scope.** The HitPay-connect auto-verify feature discussed alongside
this (letting a vendor connect their own PSP for real-time confirmation
instead of manual eyeballing) is a separate, later spec — it depends on a
PSP integration this spec doesn't touch. This spec only fixes the
gating _mechanism_; it doesn't add the feature the nudge will eventually
point to.

### Guiding decision (locked during brainstorming)

- **No feature of paykit is ever blocked by transaction volume.** Free tier
  vendors can process any number of PayNow transactions, forever, for free.
  The only things `plan` gates are Pro-exclusive features that don't exist
  on Free at all (reports, refunds) — never the core checkout mechanic
  itself.
- **Nudge is informational, not blocking, and appears only once it's
  earned.** A plain running count is always shown; the Pro nudge banner
  appears only after a vendor crosses a real usage threshold (50
  transactions in the current month — the same number already named in the
  vendor-expansion-strategy doc's own example) instead of showing "buy Pro"
  messaging to a vendor who's done 3 transactions all month.
- **Marketing copy must match the code.** Landing page and FAQ currently
  advertise "100 transactions a month, Pro removes the cap" — false once
  this ships. Both get corrected in this spec, not left to drift.

## What changes

### `src/lib/usage.ts`

Replace the cap-oriented API with a threshold-oriented one:

```ts
import type { VendorPlan } from "@/lib/types";

/** Same number named in the vendor-expansion-strategy doc's own nudge
 * example ("50+ manual payment confirms"). Not a cap — Free tier has no
 * cap — just the point a Pro nudge becomes worth showing. */
export const PRO_NUDGE_THRESHOLD = 50;

export function shouldNudgePro(
  plan: VendorPlan,
  countThisMonth: number,
): boolean {
  return plan === "free" && countThisMonth >= PRO_NUDGE_THRESHOLD;
}
```

`freeTierExceeded` and `usagePercent` are deleted — there's no cap left for
either to measure against.

### `src/app/api/v1/checkout/route.ts`

Delete the usage-count fetch and the `freeTierExceeded` block entirely
(lines 45-65 in the current file: the `startOfMonth`/count query and the
`402` response). Checkout no longer reads transaction count at all — it has
no gating decision left to make from it. This also removes the `503` "count
read failed" failure mode, since that query no longer exists.

### `src/app/dashboard/page.tsx` and `src/app/dashboard/plan/page.tsx`

Both currently render a `{count} / 100` label plus a percent-fill bar tied
to the 100-cap. Replace with:

- A plain running count, no denominator ("124 transactions this month" —
  not "124 / 100").
- Drop the percent-fill bar (nothing left to be a percentage of).
- When `shouldNudgePro(plan, count)` is true, show a small inline nudge:
  _"You're doing real volume — Pro adds reports and refund tracking, $12/mo."_
  Free vendors under the threshold see the count with no nudge at all.

`plan/page.tsx`'s feature-list section keeps listing Pro's actual perks
(reports, refunds) but drops the "Up to 100 transactions/month" /
"Unlimited transactions" lines from both tiers' lists — replaced with
"Unlimited PayNow transactions" listed once, outside the free/pro split,
since it's no longer a differentiator.

### `src/components/landing/benefits.tsx` and `src/components/landing/faq.tsx`

Correct both to describe the real model:

- benefits.tsx: _"Unlimited PayNow transactions, no card required. Pro adds
  revenue reports and refund tracking — $12/mo, once you're doing enough
  volume to want them."_ (keeps the existing "gated by scale, not by
  feature" tagline — still true, just describes feature-gating by usage
  pattern, not a transaction wall).
- faq.tsx: _"Unlimited transactions on the free plan, no cap. Pro adds
  revenue reports and refund tracking."_

### `AGENTS.md`

Data model section currently reads: `plan` (`free`|`pro`) gates the 100
tx/mo cap and Pro features (reports, refunds)`. Update to: `plan`
(`free`|`pro`) gates Pro-exclusive features (reports, refunds) — no
transaction-volume cap; Free tier PayNow checkout is unlimited`.

### Historical docs — not edited

`docs/superpowers/specs/2026-07-15-paykit-mvp-design.md` and
`docs/superpowers/plans/2026-07-15-paykit-mvp.md` are dated historical
records of what shipped in the MVP; per this project's own precedent
(established by the cross-kit profile-settings-standard doc's own
"treat the shipped migration as source of truth over any earlier design
doc" note), superseding decisions get a new dated spec, not a retroactive
rewrite of the old one. This document is that record for the cap removal.

## Testing

- `src/lib/usage.test.ts`: replace `freeTierExceeded`/`usagePercent` tests
  with `shouldNudgePro` tests (false under 50, true at/over 50 for free,
  always false for pro regardless of count).
- `src/app/api/v1/checkout/route.test.ts`: delete the two tests tied to
  removed behavior (`"402s when a free-tier vendor is at the 100/mo cap"`,
  `"503s when the usage count read fails"`) — that code path no longer
  exists. Add a test proving a free-tier vendor checkout succeeds well past
  the old 100 threshold (e.g. count = 500) to lock in the "no cap" behavior
  going forward.
- Dashboard/plan page tests (if any exist covering the usage bar) get
  updated to assert the plain count + threshold-gated nudge instead of the
  bar.

## Self-review

- No placeholders/TBDs.
- Internally consistent: every file listed operates on the same
  `shouldNudgePro`/`PRO_NUDGE_THRESHOLD` primitive; no code path still
  checks `freeTierExceeded` after this ships.
- Scope: single cohesive change (kill the cap, make the nudge earn its
  appearance, fix marketing copy to match) — not bundled with the
  HitPay/auto-verify feature, which stays a separate future spec.
- Ambiguity check: "50" is picked explicitly (matches the already-published
  vendor-expansion-strategy doc's own example) rather than left vague;
  "$12/mo" Pro price is unchanged from what's already live in
  `benefits.tsx`, not a new decision this spec is making.
