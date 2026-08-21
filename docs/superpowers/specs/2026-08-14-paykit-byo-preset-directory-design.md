# paykit — BYO Payment Preset Directory — Design

**Date:** 2026-08-14
**Status:** Approved (design); plan to follow.

## Summary

paykit's `pointer` (BYO) config today is one generic text field: a label, a
link-vs-QR-image toggle, and a hint sentence naming HitPay/GrabPay/Stripe/
Qashier as examples (`src/app/dashboard/config/payment-config-form.tsx`).
A first-time vendor — typically an SG hawker-stall or pop-up owner with no
prior online-payment setup experience — has to already know which service
they're using, find the link/QR on that service's own dashboard unaided,
and paste it into a blank field with no feedback if they got the wrong
thing.

This spec adds a small preset picker in front of that field: four cards
(Stripe Payment Link, HitPay Payment Link, PayLah! QR, Other/Custom), each
with tailored "where to find this" instructions and, for the two link-based
presets, a soft format hint if the pasted URL doesn't look right. This is
UI and copy only — no new database columns, no PSP integration, no
API keys, no OAuth. paykit's positioning stays exactly what
`docs/meta/2026-07-17-paykit-task-registry.md` and `PRODUCT.md` already
state: an onboarding concierge that helps a vendor set up _their own_
chosen payment method, not a payment service itself — deliberately short
of anything that would draw MAS scrutiny.

**Where this sits in the roadmap:** this is new work, not in the 2026-07-17
task registry. It supersedes that registry's implicit assumption that the
`pointer` kind's generic form was the finished state — recorded properly in
a task-registry update alongside this spec (see
`docs/meta/2026-08-14-paykit-task-registry.md`).

### Guiding decisions (locked during brainstorming)

- **Concierge, not PSP.** No OAuth, no API key entry, no calling out to any
  PSP's API — ever, for this feature. Validation is string-pattern
  matching against a known URL shape, nothing else. This was an explicit
  product-owner call: paykit should "not hit MAS too much" and stays a
  setup-helper, the way staff help an elderly person onboard onto a
  digital service, not a payment processor in its own right.
- **Free tier, always.** The preset picker is onboarding guidance, not a
  bookkeeping/reporting convenience — it does not fit the existing
  Pro-gate pattern (`docs/superpowers/specs/2026-07-22-paykit-freemium-
nudge-redesign-design.md`: Pro gates only reports/refunds, never a setup
  or checkout mechanic). Gating it to Pro would block exactly the vendors
  who need it most. Confirmed directly with the product owner
  2026-08-14.
- **Presets are UI-only.** No new `vendor_payment_config` column, no new
  Zod schema field. `vendorPaymentConfigInputSchema`'s `pointer` branch
  (`src/lib/schemas.ts`) is untouched — a preset selection only drives
  what the form pre-fills and displays; the saved row is
  indistinguishable in shape from any other `pointer` config saved today.
  This keeps the migration surface at zero and matches this spec's own
  "extract, don't rebuild" precedent from the 2026-07-22 multi-method
  spec.
- **Other/Custom is not a fourth-class option.** It keeps today's exact
  behavior byte-for-byte: manual label, manual link-vs-QR toggle, the
  existing generic hint paragraph. It is the permanent escape hatch for
  GrabPay, ShopeePay, Qashier, a bank's own QR, or anything not named —
  never removed, never visually demoted below the three named presets.
- **Only Stripe and HitPay get soft URL validation.** Both have a
  confirmed, stable-enough link shape to pattern-match
  (`buy.stripe.com/...` for Stripe; any URL containing `hit-pay.com` for
  HitPay — HitPay's subdomain varies, e.g. `securepayment.hit-pay.com`, so
  this is a substring check, not a strict prefix). PayLah! has no
  confirmed merchant-shareable link format (research 2026-08-14 found
  only in-app QR generation, no dashboard-copyable URL for a business
  context) — its preset is QR-image-upload only, with no URL field and
  no pattern validation.
- **Preset re-derivation on edit is best-effort, not authoritative.**
  Since no preset ID is persisted, re-opening the config form for an
  existing `pointer` config re-derives a likely preset from the saved
  `url`'s shape. Stripe/HitPay URLs re-derive reliably; everything else
  (including a previously-selected PayLah! QR, indistinguishable from any
  other uploaded QR image) falls back to "Other" — the vendor's saved
  data displays correctly either way, they just don't see the
  preset-specific instructions again on re-edit. This is stated
  explicitly so it's never mistaken for a bug.

## What changes

### `src/app/dashboard/config/pointer-presets.ts` (new)

Pure data module — no React, no I/O — the preset catalogue and the
re-derivation helper, both independently unit-testable:

```ts
export type PointerPresetId = "stripe" | "hitpay" | "paylah" | "other";
export type PointerPresetMode = "link" | "qr" | "choice";

export type PointerPreset = {
  id: PointerPresetId;
  cardLabel: string;
  labelSuggestion: string; // pre-fills the `label` field; "" = leave blank
  mode: PointerPresetMode; // "choice" = vendor still picks link vs QR (Other only)
  instructions: string; // "where to find this" copy shown under the field
  urlPattern?: RegExp; // soft validation only — never blocks save
  urlWarning?: string;
};

export const POINTER_PRESETS: Record<PointerPresetId, PointerPreset> = {
  stripe: {
    id: "stripe",
    cardLabel: "Stripe Payment Link",
    labelSuggestion: "Pay with Stripe",
    mode: "link",
    instructions:
      "Stripe Dashboard → Payment Links → New → Create link, then copy the link (starts with buy.stripe.com).",
    urlPattern: /^https:\/\/buy\.stripe\.com\//,
    urlWarning:
      "This doesn't look like a Stripe Payment Link (usually starts with buy.stripe.com) — check you copied the right one.",
  },
  hitpay: {
    id: "hitpay",
    cardLabel: "HitPay Payment Link",
    labelSuggestion: "Pay with HitPay",
    mode: "link",
    instructions:
      "HitPay Dashboard → Payment Links → Create Payment Link, then copy the link it gives you.",
    urlPattern: /hit-pay\.com/,
    urlWarning:
      "This doesn't look like a HitPay link (usually contains hit-pay.com) — check you copied the right one.",
  },
  paylah: {
    id: "paylah",
    cardLabel: "PayLah! QR",
    labelSuggestion: "Pay with PayLah!",
    mode: "qr",
    instructions:
      "Open DBS PayLah! → your QR code screen → screenshot or save the image, then upload it below.",
  },
  other: {
    id: "other",
    cardLabel: "Other / custom",
    labelSuggestion: "",
    mode: "choice",
    instructions:
      "Any other payment link or QR: GrabPay, ShopeePay, Qashier, your bank's own QR, or anything else that works.",
  },
};

export const POINTER_PRESET_ORDER: PointerPresetId[] = [
  "stripe",
  "hitpay",
  "paylah",
  "other",
];

/** Best-effort re-derivation for an existing saved config — see spec's
 * "Preset re-derivation on edit is best-effort" guiding decision. */
export function derivePointerPreset(config: {
  url: string | null;
  qr_image_url: string | null;
}): PointerPresetId {
  if (config.url && POINTER_PRESETS.stripe.urlPattern!.test(config.url))
    return "stripe";
  if (config.url && POINTER_PRESETS.hitpay.urlPattern!.test(config.url))
    return "hitpay";
  return "other";
}
```

### `src/app/dashboard/config/payment-config-form.tsx`

Inside the existing `kind === "pointer"` branch, insert a preset picker
**before** the label field:

- New state: `preset: PointerPresetId`, initialized via
  `initial?.kind === "pointer" ? derivePointerPreset(initial) : "stripe"`
  (first-run default lands on the most common case rather than "other";
  matches this form's existing pattern of defaulting `kind` to `"paynow"`
  rather than leaving it unset).
- A 2×2 card grid over `POINTER_PRESET_ORDER`, same visual language as the
  existing `KIND_OPTIONS` radio cards in this file (bordered
  `rounded-xl`, `border-primary bg-primary/5 ring-1 ring-primary/30` when
  selected, plain `border-border bg-card hover:bg-secondary/50`
  otherwise) — reuses the pattern, not a new component language.
- `onValueChange` for the preset picker:
  - Sets `preset`.
  - If `POINTER_PRESETS[preset].mode !== "choice"`, sets `pointerMode` to
    that preset's fixed mode (`stripe`/`hitpay` → `"link"`, `paylah` →
    `"qr"`) and hides the link/QR toggle for those three (only "Other"
    shows the toggle — it's the only preset where the vendor has a real
    choice).
  - If `label` is currently empty, pre-fills it with
    `POINTER_PRESETS[preset].labelSuggestion`. Never overwrites a
    non-empty label the vendor already typed (including one carried over
    from switching presets), so a vendor who already personalized their
    label never has it silently clobbered.
- Below the mode-specific field (URL input or `ImageUploader`), the
  existing generic hint paragraph is replaced by
  `POINTER_PRESETS[preset].instructions`.
- For `stripe`/`hitpay` (the only presets with a `urlPattern`): when `url`
  is non-empty and fails `urlPattern.test(url)`, render
  `POINTER_PRESETS[preset].urlWarning` as inline amber/warning text under
  the field — same tone as an inline form hint, not the existing
  `text-destructive` error styling used for real validation failures,
  since this never blocks submission. The existing "Open link" preview
  affordance (`isValidHttpUrl(url)` check) is unchanged and still shows
  regardless of preset-pattern match — a valid-but-unrecognized URL is
  still openable and still savable.

No changes to `saveConfigAction`, `src/lib/schemas.ts`, or any DB
migration — the submitted form data (`kind`, `label`, `url`/`qr_image_url`)
is byte-for-byte the same shape as today; `preset` is form-local UI state,
never sent to the server action.

### `src/app/dashboard/config/README.md`

Add a bullet documenting `pointer-presets.ts` and the preset-picker UI
addition, following this directory's existing per-file documentation
convention.

## Testing

- `src/app/dashboard/config/pointer-presets.test.ts` (new): each preset's
  `urlPattern` (where present) matches a realistic real-shaped URL and
  rejects an unrelated one; `derivePointerPreset` returns `"stripe"`/
  `"hitpay"` for matching URLs, `"other"` for a `qr_image_url`-only config
  and for an unrelated URL.
- `src/app/dashboard/config/payment-config-form.dom.test.tsx`: extend
  existing pointer-path tests — selecting each preset shows its
  instructions and pre-fills `label` when empty but not when already set;
  selecting Stripe/HitPay hides the link/QR toggle and fixes the mode;
  selecting Other shows the toggle exactly as today; a non-matching URL
  under Stripe/HitPay renders the warning text without blocking the save
  button; the existing "Open link" and `ImageUploader` behaviors are
  unaffected.

## Out of scope

- Any PSP API integration, OAuth, or API-key entry — explicitly ruled out
  this round (see Guiding decisions). A future real-verification feature
  (task registry T3) remains a separate, later, not-yet-approved spec.
- Regional-rail presets (DuitNow/PromptPay/QRIS/QR Ph — task registry T5)
  — no current demand signal, unaffected by this spec's structure but not
  added now.
- Persisting which preset a vendor picked (e.g. for future analytics on
  preset popularity) — deliberately not stored; would need a new column
  and isn't needed for this spec's goal.
- GrabPay/ShopeePay/FavePay as named presets — research found no
  confirmed simple dashboard-copyable merchant link for any of the three;
  they stay covered by "Other/Custom" until/unless a reliable link
  mechanism is confirmed.

## Self-review

- No placeholders/TBDs.
- Internally consistent: every preset in `POINTER_PRESETS` is consumed
  identically by both the picker UI and `derivePointerPreset`; no code
  path assumes a preset ID is persisted anywhere it isn't.
- Scope: single cohesive UI/copy change to the existing `pointer` branch;
  explicitly excludes PSP integration, regional rails, and preset
  persistence, each flagged as a separate future item.
- Ambiguity check: the Free-vs-Pro placement and the "no PSP call-outs,
  ever" boundary were both open questions this session — both are now
  locked, explicit product-owner decisions recorded above, not left
  implicit.
