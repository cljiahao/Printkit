# paykit — Task Registry (2026-07-17)

paykit's first standing backlog. Previously this list only existed as an
unstructured "Follow-ups (tracked, not this spec)" bullet list at the
bottom of `docs/superpowers/specs/2026-07-15-paykit-mvp-design.md` — no
priority, no status, no dates. Promoted here so it's a real registry, the
same way qkit's `docs/meta/2026-07-02-master-task-registry.md` works.

**Context that shapes everything below:** paykit is fully built and tested
(EMVCo-correct PayNow QR generation, checkout/claim/confirm flow, RLS +
pgTAP coverage) but **nothing calls it yet** — confirmed 2026-07-17,
`docs/DEPLOY.md` states outright "no calling kit is wired up yet in this
scope." Every item below is about giving this real engine real callers, not
about paykit's own correctness (that part's done).

## P1 — makes paykit actually used

### T1. Wire qkit's checkout to paykit's API

qkit currently has its own hand-rolled PayNow QR builder
(`qkit/src/lib/payments/paynow.ts`) — a second, independent implementation
of the same thing paykit already does. Per the Merqo-wide roadmap
(`Merqo Business/docs/business/2026-07-17-merqo-roadmap.md`, Phase 2, Gap
2), migrate qkit to call paykit's `/api/v1/checkout` instead and remove
qkit's local duplicate.

**Note on urgency, cross-referenced from the qkit side:** qkit's in-person,
vendor-present PayNow flow is trust-based (customer taps "I've paid," vendor
visually confirms) and works fine without paykit precisely because a vendor
is physically present to catch fraud — this integration is valuable for
_consolidation_ (one PayNow implementation, not two) but is **not blocking
qkit's Phase 1 Manfred pilot**. Don't let this task's priority get confused
with Phase 1 urgency.

### T2. Wire shopkit to paykit at build time

Shopkit doesn't exist yet. Once it's scaffolded, its checkout should call
paykit from day one rather than repeating qkit's original mistake (T1) of
building a local duplicate first. **This is the one integration that's
actually load-bearing, not optional** — shopkit's ordering is remote/async
(no vendor present to catch a fraudulent "I've paid" claim the way qkit's
in-person flow can), so it needs paykit's real payment verification, not a
trust-based flow. See the vendor-expansion-strategy doc's reasoning
(`Merqo Business/docs/business/2026-07-17-vendor-expansion-and-integrations-strategy.md`).

## P2 — real verification, not urgent yet

### T3. Real auto-verify — HitPay is now the concrete candidate

`autoVerify()` (`src/lib/payments/adapter.ts:33-35`) is a literal
`throw new Error("auto-verify not enabled")` stub — the spec always framed
this as contingent ("once/if a bank API partnership is feasible") with no
named partner. As of 2026-07-17 there's a concrete candidate: **HitPay** —
SG-native, MAS-licensed, already handles PayNow, and adds Tap-to-Pay (works
with both Android and iPhone, not Apple-only) with no extra hardware. One
PSP integration could eventually replace paykit's own hand-rolled PayNow QR
builder too, not just add auto-verify. Still Phase 2 — not needed for
qkit's Manfred pilot, which uses qkit's own manual-confirm flow.

**Update (2026-07-18):** the founder is actively getting a Singapore ACRA
business registration specifically to attach **Stripe** for merqo hub's
own subscription billing (see merqo hub's `docs/meta/2026-07-17-merqo-
hub-task-registry.md`, T3) — a real, in-progress timeline now. Worth an
explicit decision once ACRA clears: one PSP for both billing and customer
payments, or Stripe for billing + HitPay for PayNow-adjacent customer
payments specifically. Not decided yet — don't assume Stripe replaces
HitPay here without that conversation happening first.

## P3 — cosmetic, no functional dependency

### T4. paykit's own PascalCase logo mark + accent color — DONE (2026-07-22)

Per `docs/business/2026-07-15-kit-brand-naming-convention.md` (lives in the
merqo hub repo) — every kit gets its own accent color chosen for a reason
specific to that product (qkit → ember, loopkit → gold stamp-dots). paykit
shipped its "Signal & Mint" visual identity (`--mint`/`--ink`, commit
`ce3e0db`) plus the full brand-icon family (`src/lib/brand-icon.tsx`,
`src/app/icon.tsx`, `src/app/apple-icon.tsx`, commit `b5d3120`), matching
`docs/business/2026-07-21-brand-icon-family-standard.md`'s own color table.

## P4 — future market expansion, no current demand signal

### T5. Regional instant-payment QR rails — DuitNow, PromptPay, QRIS, QR Ph

Merqo's entire vendor base today is Singapore hawkers/pop-ups — there is
**no current demand signal** for this; it's a placeholder for if Merqo
ever expands beyond SG, not a near-term task. Recorded now only because
the 2026-07-22 multi-method work (`docs/superpowers/specs/2026-07-22-
paykit-multi-method-byo-design.md`) happens to leave paykit well-shaped
for it.

**What this would be:** a new `vendor_payment_config.kind` value per
rail — `duitnow` (Malaysia), `promptpay` (Thailand), `qris` (Indonesia),
`qrph`/InstaPay (Philippines) — following the exact "extract, don't
rebuild" precedent `paynow.ts` itself set. All four of these rails (like
PayNow) are built on the EMVCo Merchant-Presented QR standard — same
TLV/CRC-16 structure `src/lib/payments/paynow.ts`'s `crc16`/`tlv`
primitives already implement. Adding one is mostly "new GUID + new
payee-identifier field per rail," not a new QR engine.

**One assumption to not make when this gets picked up:** DuitNow and
PayNow are already cross-border interoperable (SGD–MYR QR linkage, live
since 2023) — but that interoperability lives at the **settlement layer**
between MAS and Malaysia's central bank, not at the QR-format layer. A
Malaysian customer can already scan a PayNow QR and pay via DuitNow today,
without paykit doing anything. What this task is actually for is the
_reverse_ case — a Malaysian **vendor** wanting their own DuitNow QR
generated for _their_ customers — which does need a real new `kind`
(DuitNow's payee-identifier scheme differs from PayNow's UEN/mobile), not
a re-skin of the existing `paynow` kind.

**Where it fits relative to `pointer`:** until this is built, a Malaysian
(or Thai, Indonesian, Filipino) vendor can already get most of the way
there today via the `pointer` kind shipped 2026-07-22 — bring their own
DuitNow/PromptPay/QRIS QR image or payment link, same as any other BYO
method. A native `kind` per rail is the "generate it for them" upgrade
over "let them bring their own," same relationship `paynow` already has
to `pointer`.

## Note: architecture consistency worth flagging

paykit's own design already treats `refunds` as "a bookkeeping ledger only
— the vendor still moves money themselves via their own PayNow/bank" (spec,
"Out of scope"). This is the **exact same pattern** qkit independently
arrived at for its own T24 (cancel-then-refund semantics, see qkit's
`docs/meta/2026-07-02-master-task-registry.md`) — both kits keep
order/payment _state_ tracking separate from actual money movement, because
PayNow itself has no rail-level refund mechanism to build against. Worth
knowing this is a deliberate, now-twice-confirmed pattern, not a gap in
either kit.
