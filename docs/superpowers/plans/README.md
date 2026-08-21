# plans

## Purpose

Step-by-step implementation plans, one per feature, each derived from the matching design spec in `../specs/`. These are historical build records (task breakdowns, file maps, self-review notes) — kept as project history, not living docs.

## Contents

- `2026-07-15-paykit-mvp.md` — "paykit MVP Implementation Plan": stands up paykit as a brand-new, standalone Next.js + Supabase repo — the Merqo family's shared PayNow payment engine — with its own `paykit` schema, a bearer-secret cross-kit HTTP API (`/api/v1/checkout` + claim/confirm/status), the EMVCo PayNow QR builder ported from qkit, and the vendor dashboard.
- `2026-07-22-paykit-freemium-nudge-redesign.md` — "paykit Freemium Nudge Redesign Implementation Plan": removes paykit's hard 100-transactions/month checkout block on the Free tier, replacing it with an unlimited Free tier plus an informational Pro nudge that only appears once a vendor crosses real usage (50 tx/mo).
- `2026-07-22-paykit-multi-method-byo.md` — "paykit Multi-Method BYO Payment Config Implementation Plan": adds a second payment-method kind (`pointer` — a vendor's own payment link or QR image) alongside paykit's existing `paynow` kind, porting the discriminated-union pattern already shipped in qkit.
- `2026-08-13-payment-provider-seam.md` — "Payment Provider Seam Implementation Plan": gives paykit a pluggable `PaymentProvider` interface so wiring in a real payment gateway later is a config change plus one new provider implementation, not a redesign — the existing EMVCo builder becomes the default (`"direct"`) provider, behavior unchanged. Shipped as `qkit`-adjacent work in [paykit#48](https://github.com/cljiahao/Paykit/pull/48); this plan file itself was written alongside that PR but only landed in this commit.
- `2026-08-15-paykit-byo-preset-directory.md` — "BYO Payment Preset Directory Implementation Plan": adds a four-card preset picker (Stripe Payment Link, HitPay Payment Link, PayLah! QR, Other/Custom) to the `pointer` config form's BYO branch, each preset with tailored "where to find this" copy and, for Stripe/HitPay, a soft URL-shape warning — UI/copy only, no new database column, no PSP integration.
- `2026-08-15-paykit-pro-simplification.md` — "paykit Pro Simplification Implementation Plan": cuts Pro's price to $4/mo, un-gates the stats/revenue chart to Free, fixes the nudge/landing/FAQ copy at every call site, and syncs the cross-kit pricing plan doc's paykit row and bundle-discount math — no schema/migration/RLS change, `VendorPlan` stays a 2-value type.
- `2026-08-15-paykit-admin-pricing.md` — "paykit Admin-Tunable Pricing Implementation Plan": adds the `paykit.pricing` table, a `setPricing` admin action, and a `PricingSection` wrapper around `@merqo/ui`'s new `PricingForm`, then switches every price call site (plan page, dashboard nudge, landing copy) from the old `PRO_PRICE` constant to a live DB read seeded at $4.99/mo.

## Parent

[docs](../../README.md)
