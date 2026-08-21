# paykit MVP — Design

**Date:** 2026-07-15
**Status:** Approved (design); plan to follow.

## Summary

paykit is the Merqo family's shared PayNow payment engine — Week 3 of the
[roadmap](../../business/2026-07-12-merqo-roadmap.md). It extracts the
already-proven PayNow QR + payment-confirmation logic that shipped inside
qkit (`src/lib/payments/paynow.ts`, the EMVCo QR builder, and the
`pending → claimed → confirmed` state machine from
[qkit's payments-seam design](../../../qkit/docs/superpowers/specs/2026-06-28-qkit-payments-seam-design.md))
into a standalone kit that any other kit can call over HTTP, following the
same extraction precedent as Week 0's menukit pull-out.

**This spec covers paykit as a standalone service only.** Cutting qkit over
to actually call it (and deleting qkit's local duplicate) is a deliberately
separate, later spec — paykit needs to ship and prove stable first before a
live, revenue-bearing feature depends on it. No other kit integrates with
paykit in this scope; the HTTP API is built and ready, but the "connection
between paykit and other kits" is explicitly future work.

### Guiding decisions (locked during brainstorming)

- **Extract, don't rebuild.** The EMVCo PayNow payload builder and the
  claim/confirm state machine are already correct and tested in qkit — port
  them, don't redesign them.
- **Per-vendor config, not per-entity.** A vendor has one bank account, not
  one per booth/store. PayNow config (UEN/mobile + payee name) is keyed by
  `vendor_id` and reused across every kit/booth/store that vendor runs —
  set up once in paykit, usable everywhere. This works because qkit,
  loopkit, and merqo already share one Supabase project (`auth.users`), so
  `vendor_id` is already a global identity — no email-matching needed.
- **Embedded QR, not hosted redirect.** A calling kit's server requests a
  QR from paykit's API and renders it in its own UI — the customer never
  leaves the calling kit's app. Matches qkit's current UX exactly and the
  roadmap's own wording ("any kit requests payment to paykit, returns QR +
  status").
- **No money flow — still.** paykit never touches funds, same as qkit's
  original BYO-payment principle. It only renders a QR the customer scans
  in their own bank app and tracks a status a human confirms. This keeps
  paykit out of MAS-regulated territory, same reasoning qkit already
  established.
- **Disputed state, real auto-verify: deferred.** The roadmap mentions a
  `disputed` tx state and Pro "auto-verify polling" — neither has a proven
  design or a technical path yet (auto-verify would need a bank-specific
  API partnership, e.g. DBS PayNow Business API, which doesn't exist
  today). Both are schema-reserved / left out rather than half-designed
  into the MVP.
- **Freemium gates by scale, not by feature-hiding.** Per the naming/roadmap
  discussion of 2026-07-15: every kit should be free-by-default with the
  Pro gate placed where running it at real volume gets hard, not on a
  feature a small vendor needs on day one. paykit's Free tier already fits
  this — manual confirm (the core mechanic) is free for everyone; the gate
  is transaction _volume_ (100/mo), and Pro's other perks (reports,
  refunds) are scale/bookkeeping features a high-volume vendor needs, not
  gatekept basics.

## Data model (`paykit` schema, same shared Supabase project)

```sql
vendor_payment_config (
  vendor_id uuid primary key references auth.users(id),
  uen text,                    -- exactly one of uen/mobile
  mobile text,
  payee_name text not null,
  verification_method text not null default 'manual', -- 'manual' | 'auto' (reserved)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

transactions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references auth.users(id),
  kit_slug text not null,           -- which kit created it, e.g. 'qkit'
  order_ref text not null,          -- the calling kit's own order id/reference (opaque)
  amount_cents integer not null,
  status text not null default 'pending', -- 'pending' | 'claimed' | 'confirmed'
  qr_payload text not null,         -- generated once at creation, stored for replay/audit
  claimed_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
)

refunds (               -- Pro only; bookkeeping, not real money movement
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id),
  refunded_amount_cents integer not null,
  reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
)

kit_api_keys (           -- one bearer secret per calling kit, service-role managed
  kit_slug text primary key,
  secret_hash text not null,
  created_at timestamptz not null default now()
)
```

A `vendor_payment_config` requires exactly one of `uen`/`mobile` plus
`payee_name` — Zod-validated at the write boundary, same discriminated-union
pattern as qkit's `booths.payment`.

## Cross-kit HTTP API

Bearer-secret auth, one secret per calling kit — same no-direct-schema-access
rule as merqo's existing metrics API. A kit authenticates as itself; every
call carries the `vendor_id` it's acting on behalf of (trusted because the
calling kit already knows its own vendor's identity via the shared
`auth.users`).

| Endpoint                                 | Purpose                                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/checkout`                  | `{vendor_id, amount_cents, order_ref}` → `{transaction_id, qr_payload}`. 422 if the vendor has no PayNow config yet.              |
| `POST /api/v1/checkout/{id}/claim`       | Customer tapped "I've paid". `pending → claimed`. Idempotent.                                                                     |
| `POST /api/v1/checkout/{id}/confirm`     | Vendor confirmed receipt. `claimed\|pending → confirmed`, sets `confirmed_at`. Idempotent.                                        |
| `GET /api/v1/checkout/{id}`              | Current status, for polling/sync.                                                                                                 |
| `GET /api/v1/vendors/{vendor_id}/config` | Has this vendor set up PayNow? (bool + payee_name, never secrets) — lets a calling kit gate/nudge setup before allowing checkout. |

Free tier: 100 tx/mo **per vendor, counted across every kit** that used
paykit for them — paykit is the single shared engine, so it's the natural
source of truth for the cap.

## Vendor-facing paykit app

Vendor logs in with their existing shared account (no new signup — same
`auth.users` session as their other kits). `/dashboard`:

- Set up / edit PayNow config once (reused everywhere)
- Unified transaction log across every kit that's used paykit for them
- Revenue reports (Pro) — aggregated across kits
- Issue a refund ledger entry against a confirmed transaction (Pro)
- Free-tier usage meter + upgrade nudge at/near the 100 tx/mo cap (same
  friction-based nudge pattern as the rest of the roadmap)

No customer-facing pages in paykit itself in v1 — the customer never visits
paykit's own domain; QR + claim UI render entirely inside whichever kit
initiated the checkout.

## Adapter (ported from qkit)

```ts
interface PaymentAdapter {
  kind: "paynow";
  renderCheckout(
    config: VendorPaymentConfig,
    ctx: { amountCents: number; orderRef: string },
  ): { type: "qr"; payload: string };
}
```

The EMVCo builder (`buildPayNowPayload`, `crc16`, `tlv`) moves verbatim from
`qkit/src/lib/payments/paynow.ts` — it's pure, already unit- and
mutation-tested, no I/O. `verification_method: 'auto'` is schema-reserved
and its adapter throws `"auto-verify not enabled"` — same dark-adapter
precedent as qkit's reserved (never-built) Stripe slot. Nothing calls it
until a real bank API partnership exists.

## Security / RLS

- Vendor RLS: a vendor reads/writes only their own `vendor_payment_config`
  and `transactions` (`vendor_id = auth.uid()`), same as every other kit.
- The cross-kit write API (`/checkout`, `/claim`, `/confirm`) is
  service-role + bearer-secret, server-only — the actor is another kit's
  server, not a logged-in paykit user, same shape as qkit's existing
  `claimPayment`/`confirmPayment` server actions.
- No secrets in any response body. `qr_payload` is public-by-design (a
  PayNow QR always is — same as today).
- Every write validated by Zod at the boundary.

## Testing

- **Unit (mutation-tested, `src/lib`):** ported EMVCo builder tests
  (already exist, just relocate), tx state-machine transitions, Zod schemas
  (accept/reject matrix).
- **Contract test:** the HTTP API surface, same pattern as merqo's existing
  `test/contract/qkit-metrics.contract.test.ts`.
- **RLS (pgTAP):** vendor isolation on config/transactions; a calling kit's
  bearer secret can act only via the service-role path, never direct table
  access.
- **DOM:** vendor dashboard (config form, tx log, refund action).

## Out of scope (v1)

- Cutting qkit (or any other kit) over to actually call paykit — separate,
  later spec, after paykit ships and proves stable.
- `disputed` transaction state.
- Real auto-verify (schema-reserved only; adapter throws until a bank API
  partnership exists).
- Real refund money movement — `refunds` is a bookkeeping ledger only; the
  vendor still moves money themselves via their own PayNow/bank.
- shopkit or any other kit's payment UI — nobody's integrated yet by design.
- paykit's own PascalCase logo mark + accent color — built when it gets a
  visual identity pass (see Follow-ups).

## Follow-ups (tracked, not this spec)

- Migrate qkit to call paykit's API; remove qkit's local payment duplicate.
- Wire shopkit (or whichever kit ships next) to paykit at build time.
- paykit's own PascalCase logo mark + accent color, per
  `docs/business/2026-07-15-kit-brand-naming-convention.md`.
- Real auto-verify, once/if a bank API partnership is feasible.
