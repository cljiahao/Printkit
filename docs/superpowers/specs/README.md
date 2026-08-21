# specs

## Purpose

Design docs, one per feature, written and approved before the matching implementation plan in `../plans/`. Each states the problem, the locked decisions, and the scope boundary — kept as project history, not living docs.

## Contents

- `2026-07-15-paykit-mvp-design.md` — "paykit MVP — Design": extracts the already-proven PayNow QR + payment-confirmation logic that shipped inside qkit into paykit, the Merqo family's shared PayNow payment engine, with its own schema and a bearer-secret cross-kit HTTP API.
- `2026-07-22-paykit-freemium-nudge-redesign-design.md` — "paykit — Freemium Redesign: Nudge, Not Block — Design": replaces paykit's hard 100-transactions/month Free-tier checkout block (which contradicts the platform's own onboarding philosophy) with an unlimited Free tier plus a usage-triggered informational Pro nudge.
- `2026-07-22-paykit-multi-method-byo-design.md` — "paykit — Multi-Method BYO Payment Config — Design": adds a `pointer` payment-method kind (a vendor's own link/QR image — Stripe, GrabPay, HitPay, a photographed bank QR, etc.) alongside the existing `paynow` kind, porting the discriminated-union pattern qkit already solved.
- `2026-08-14-paykit-byo-preset-directory-design.md` — "paykit — BYO Payment Preset Directory — Design": replaces the `pointer` config's one generic text field with a curated preset picker (Stripe Payment Link, HitPay Payment Link, PayLah! QR, Other/Custom) plus tailored per-service instructions, closing a real onboarding-friction gap for first-time SG hawker/pop-up vendors. Free tier always; no PSP integration of any kind — UI/copy only.
- `2026-08-15-paykit-pro-simplification-design.md` — "paykit — Pro Simplification: $4/mo, Refunds-Only — Design": drops two earlier same-session drafts (a per-transaction fallback tier, then a two-tier `lite`/`pro` split with identical features) in favor of one honest fix — cuts Pro to a single $4/mo, moves the stats/revenue chart to Free (transaction tracking was already free), and leaves refund tracking as Pro's one real gate. Documents real auto-verify as a future, BYO-PSP-only Pro perk (can't cover PayNow-QR vendors, so can't be the only thing Pro sells) — not implemented. No schema/migration/RLS change.
- `2026-08-15-paykit-admin-pricing-design.md` — "paykit — Admin-Tunable Pricing: $4.99/mo — Design": replaces the hardcoded `PRO_PRICE` constant with a single-row `paykit.pricing` table an admin edits live from `/admin` (mirrors qkit's own admin-pricing pattern), wiring in `@merqo/ui`'s new shared `PricingForm` component as paykit's first real adopter, and corrects the price itself from $4/mo to $4.99/mo (a charm-pricing correction, not a new argument — see the per-kit pricing rationale doc).

Also relevant, kept outside this repo: `../../../docs/superpowers/specs/2026-08-13-paynow-tap-to-pay-design.md` (cross-kit, in the parent `Merqo Business/docs`) — the design behind `../plans/2026-08-13-payment-provider-seam.md`, covering the same-device QR UX fix (qkit-side) and this repo's pluggable `PaymentProvider` seam.

- `2026-08-17-future-vendor-telegram-alerts-design.md` — "Future: Vendor Telegram Alerts — Design Notes": draft, deferred — paykit never shipped Phase A (no equivalent "vendor isn't looking" gap the way qkit/loopkit had); names a `claimed`-but-unconfirmed transaction as the leading candidate trigger if this ever gets scoped, and notes merqo's now-shared vendor-alert bot means only a small `notify-vendor` call would be needed, no new connect flow.

## Parent

[docs](../../README.md)
