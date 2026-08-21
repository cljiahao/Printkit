# Future: Vendor Telegram Alerts — Design Notes

**Date:** 2026-08-17
**Status:** Draft — deferred, no go-ahead. Not a scoped spec, a placeholder
capturing the idea and what's already reusable, so a future discussion
doesn't start from zero.

## Why paykit doesn't have this yet

qkit (order placed) and loopkit (reward redeemed) both shipped a vendor
Telegram alert because each has a real "vendor isn't looking right now"
gap — a customer acts, the vendor finds out only if they happen to check
the dashboard. paykit's core loop (`pending → claimed → confirmed`) is
usually synchronous: a vendor is standing at the counter, watches the
customer pay, taps confirm. That's why paykit was never scoped into
Phase A — see
`Merqo Business/docs/business/2026-08-16-telegram-integration-design.md`.

## The one real candidate, if this gets picked up

**A `claimed` transaction the vendor hasn't confirmed yet.** A customer
can tap "I've paid" (`claimCheckout`) and walk off before the vendor
notices — the same "vendor isn't looking" gap qkit/loopkit solved, just a
narrower window. Worth naming as the leading candidate if this ever gets
scoped, not the only option — a real go/no-go conversation (is this
actually a problem vendors hit, or does the in-person nature of most
paykit checkouts make it rare) should happen before building it, same
caution the portfolio roadmap doc already applies to every speculative
item.

## What's already reusable, if approved

merqo now owns the one shared vendor-alert bot (Phase A2,
`merqo/docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`).
A vendor who's already connected via merqo's profile page (for qkit or
loopkit alerts) needs **zero new connect flow** — paykit would only need
to call merqo's existing `POST /api/merqo/notify-vendor` with
`{ vendor_id, message }` from wherever `claimCheckout` (or whatever the
chosen trigger ends up being) lands, same `MERQO_CUSTOMER_SECRET` bearer
pattern every other kit already uses. This is a small addition once a
trigger is approved, not a new architecture.

## Parent

[specs](README.md)
