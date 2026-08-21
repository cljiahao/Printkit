# paykit — Task Registry (2026-08-14)

> Supersedes `2026-07-17-paykit-task-registry.md` for status/priority.
> That doc's per-item numbering (T1-T5) is kept for continuity; items are
> updated in place, not renumbered, and one item (T6) is new.

## P1 — makes paykit actually used

### T1. Wire qkit's checkout to paykit's API — DONE (2026-08-15 verified)

Was the one confirmed-open Phase-2 gap per the 2026-07-31/2026-08-02
Merqo roadmap refreshes; those refreshes predate the actual cutover and
this registry's own "still not done" line was stale by the time it was
written. Verified directly against qkit's code (2026-08-15): `qkit #66`
("cut checkout over to paykit's HTTP API") and `qkit #70` ("prefill
payment config on booth re-edit, restore unclaim") shipped this.
`src/lib/paykit/client.ts`, `src/app/dashboard/order-actions.ts`
(`confirmOrderPayment` → paykit's `createCheckout`/`confirmCheckout`),
and `src/app/order/[boothId]/[orderNumber]/payment-actions.ts`
(`claimPayment`/`unclaimPayment` → paykit's checkout/claim/unclaim) all
call paykit's HTTP API — qkit's local PayNow builder is no longer what's
live for real checkouts. Progress since 07-17, for context:

- 2026-08-11: `POST /api/v1/vendors/{vendor_id}/config` shipped — qkit can
  now write a vendor's `vendor_payment_config` server-to-server, for a
  "quick add PayNow details" UI inside qkit's own dashboard.
- qkit #76: qkit's booth-edit Payment section now links out to paykit's
  own dashboard.

### T2. Wire shopkit to paykit at build time — unchanged, not started

Shopkit doesn't exist yet. Still the one load-bearing integration once it
does (see 07-17 registry for full reasoning — unchanged).

### T6. BYO payment preset directory — DONE (2026-08-15, `paykit #50`)

Not in the 07-17 registry — new work surfaced by 2026-08-14 roadmap
research. Today's `pointer` (BYO) config is a blank label+URL field with a
generic hint; research into how a non-technical SG hawker/pop-up vendor
actually finds their own payment link (Stripe, HitPay, PayLah!, etc.)
found this is real onboarding friction, and that a curated preset picker
plus tailored per-service instructions is a proven, low-risk pattern
(Linktree's "Commerce Link" named-preset blocks are the closest working
precedent). Full design:
`docs/superpowers/specs/2026-08-14-paykit-byo-preset-directory-design.md`.
Plan: `docs/superpowers/plans/2026-08-15-paykit-byo-preset-directory.md`.
Shipped: `src/app/dashboard/config/pointer-presets.ts` (preset data +
best-effort `derivePointerPreset` re-detection on edit) and the picker UI
in `payment-config-form.tsx`. Caught and fixed one real bug during review:
the HitPay preset's URL-match regex was unanchored (`/hit-pay\.com/`,
matched as a substring anywhere in a URL, e.g. a spoofed
`hit-pay.com.attacker.example`) — now anchored to the host
(`/^https:\/\/([a-z0-9-]+\.)*hit-pay\.com(\/|$|\?|:)/i`), same style as the
Stripe preset's existing anchored pattern. Low real-world severity (this
match only drives a soft, non-blocking warning, never an authorization
boundary) but fixed properly rather than suppressed.

**Locked decisions from this round:**

- **Free tier, always** — this is onboarding guidance, not a
  bookkeeping/reporting convenience, so it doesn't fit the existing
  Pro-gate pattern. Gating it would block the vendors who need it most.
- **No PSP integration of any kind** — no OAuth, no API keys, no calls to
  any PSP's API. Pure UI/copy + soft URL-pattern hints. Explicit
  product-owner call: paykit stays a setup concierge, not a payment
  service, and deliberately avoids anything that risks MAS scrutiny —
  this boundary applies to T6 and should be the default assumption for
  any future paykit work in this direction, not just this one spec.
- v1 preset shortlist: Stripe Payment Link, HitPay Payment Link, PayLah!
  QR, Other/Custom. GrabPay/ShopeePay/FavePay deferred — no confirmed
  simple dashboard-copyable merchant link found for any of the three as
  of this research pass.

## P2 — real verification, not urgent yet

### T3. Real auto-verify — status unchanged, scope boundary reaffirmed

HitPay remains the named candidate _if_ paykit ever does real PSP
integration (07-17 registry has the full reasoning; Stripe-vs-HitPay
billing decision still not made). **Reaffirmed 2026-08-14:** the
product-owner's "concierge, not PSP" stance from T6's brainstorming
applies here too — any future move on T3 needs its own explicit go-ahead,
not an assumption that T6's preset work is a step toward it. They are
deliberately separate: T6 never calls a PSP; T3, if it ever happens, is
the only place that would.

## P3 — cosmetic, no functional dependency

### T4. paykit's own PascalCase logo mark + accent color — DONE (2026-07-22)

Unchanged from 07-17 registry — already shipped.

## P4 — future market expansion, no current demand signal

### T5. Regional instant-payment QR rails — unchanged, still no demand signal

Unchanged from 07-17 registry. Note: T6's preset-directory _pattern_
(named preset + tailored instructions + custom fallback) would extend
cleanly to a regional rail once one is actually added, but T5 itself is
still not started and still has no demand signal.

## Open items carried forward, unresolved

- **paykit admin console** — flagged in the 2026-07-31 Merqo roadmap
  refresh as a real gap (paykit has zero admin UI). Not scoped, not part
  of this research pass.
- **Two-week-growth re-audit** — the 07-17→07-31 gap in paykit's own
  growth was never independently re-verified per the 08-02 roadmap
  refresh. Unrelated to T6; noted here only so it isn't lost.

## Parent

[docs/meta](README.md)
