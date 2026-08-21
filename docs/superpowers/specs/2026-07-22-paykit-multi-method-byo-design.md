# paykit — Multi-Method BYO Payment Config — Design

**Date:** 2026-07-22
**Status:** Approved (design); plan to follow.

## Summary

paykit today only supports one payment method: a PayNow QR the vendor's
UEN/mobile generates. Every other Merqo vendor payment need — a Stripe
Payment Link, a GrabPay for Business QR, a HitPay checkout link, or a
photographed bank QR — has no home in paykit at all.

qkit already solved this problem locally, one extraction cycle before
paykit itself existed. qkit's `PaymentConfig` (`src/lib/types.ts`) is a
discriminated union — `pointer` (a vendor's own link or QR image) |
`paynow` (qkit's own generated QR) | `stripe` (reserved, dark) — and its
`renderCheckout` (`src/lib/payments/adapters.ts`) switches on `kind` to
produce a `CheckoutView` (`qr` | `link` | `image`). This is a proven,
already-shipped pattern, not a new design — this spec ports it into
paykit, the same "extract, don't rebuild" precedent paykit's own PayNow
engine already followed when it was pulled out of qkit.

**Why now, not later:** per the 2026-07-22 research on paykit's
zero-adoption risk, wiring qkit to call paykit (T1) is the higher-priority
fix — but doing that _before_ paykit supports `pointer` configs would be a
regression for any qkit vendor currently using one (they'd lose that
option the moment qkit switched over). This spec makes paykit a strict
capability superset of qkit's local system first, so T1 (a separate,
later, cross-repo spec — not started here) can be a same-capability swap
instead of a downgrade. **This spec touches paykit's repo only.** qkit is
not modified.

### Guiding decisions (locked during brainstorming)

- **Port, don't redesign.** qkit's `pointer`/`paynow`/`stripe` discriminated
  union and `renderCheckout` switch are already correct and proven — copy
  their shape into paykit, adapted to paykit's schema conventions (Zod
  validation, Postgres row shape), not reinvented.
- **No "none" option.** qkit's config UI has a `"none"` kind (a booth can
  run with zero online payment) — paykit has no equivalent, because a
  vendor's entire reason to configure paykit is to have _a_ payment method.
  paykit's picker has exactly two options: PayNow QR, or Payment link/QR
  image.
- **Breaking the checkout API response shape is safe right now.**
  `POST /api/v1/checkout` currently returns a bare `qr_payload: string`.
  Generalizing this to a discriminated `{type, ...}` shape is a breaking
  change to the public API contract — acceptable today specifically
  because paykit has zero live callers (confirmed in the 2026-07-22
  zero-adoption research). This is the correct moment to fix this, before
  T1 ever gives the contract a real consumer to break.
- **Generic API surface uses `display_name`, not `payee_name`.** Per the
  2026-07-22 API-design research (Stripe/Adyen/PayPal all keep merchant
  display identity at a method-agnostic layer, separate from
  method-specific fields), `GET /vendors/{id}/config` returns
  `display_name` — populated from `payee_name` for a `paynow` config, from
  `label` for a `pointer` config. `payee_name` remains the internal
  PayNow-specific config field name; it is not the generic API field name
  once a second method kind exists.
- **QR-image upload reuses paykit's existing `ImageUploader`.** Built
  during the profile-page work this session
  (`src/components/image-uploader.tsx`, `bucket`/`pathPrefix`/`value`/
  `onChange` props), already pointed at the shared `vendor-images` Storage
  bucket. No new upload component — qkit's own `ImageUploader` has a
  different prop shape (`vendorId`/`variant`) and is not reused directly;
  paykit's config form calls paykit's own component with the same
  `bucket="vendor-images"` pattern the profile page already uses.

## What changes

### `supabase/migrations/0003_paykit_multi_method.sql` (new)

Additive migration — no data loss, no column drops:

```sql
alter table paykit.vendor_payment_config
  add column kind text not null default 'paynow' check (kind in ('paynow', 'pointer')),
  add column label text,
  add column url text,
  add column qr_image_url text;

-- payee_name/uen/mobile are only meaningful for kind='paynow'; label/url/
-- qr_image_url only for kind='pointer'. Existing rows are all 'paynow'
-- today (the default), so backfill is implicit — no UPDATE needed.
alter table paykit.vendor_payment_config
  drop constraint vendor_payment_config_one_proxy;

alter table paykit.vendor_payment_config
  add constraint vendor_payment_config_kind_shape check (
    (kind = 'paynow' and payee_name is not null
      and ((uen is not null and mobile is null) or (uen is null and mobile is not null))
      and label is null and url is null and qr_image_url is null)
    or
    (kind = 'pointer' and payee_name is null and uen is null and mobile is null
      and label is not null
      and ((url is not null and qr_image_url is null) or (url is null and qr_image_url is not null)))
  );
```

`payee_name` drops its `not null` (pointer configs have none):

```sql
alter table paykit.vendor_payment_config alter column payee_name drop not null;
```

Grants: the existing `grant insert (vendor_id, uen, mobile, payee_name,
verification_method) on paykit.vendor_payment_config to authenticated` and
matching `update` grant both need `kind, label, url, qr_image_url` added to
their column lists — same pattern, `plan` stays excluded (service-role
only, unrelated to this change).

### `src/lib/types.ts`

`VendorPaymentConfig` (the flat DB row type) grows the new nullable
columns:

```ts
export type PaymentConfigKind = "paynow" | "pointer";

export type VendorPaymentConfig = {
  vendor_id: string;
  kind: PaymentConfigKind;
  uen: string | null;
  mobile: string | null;
  payee_name: string | null; // was: string (now nullable — pointer has none)
  label: string | null;
  url: string | null;
  qr_image_url: string | null;
  verification_method: VerificationMethod;
  plan: VendorPlan;
  created_at: string;
  updated_at: string;
};
```

`Database.paykit.Tables.vendor_payment_config.{Insert,Update}` gain the
same four fields (all optional on `Insert`, all optional on `Update`,
matching the existing pattern for `uen`/`mobile`).

### `src/lib/payments/adapter.ts`

Replace the single `paynowAdapter` with a `kind`-switching
`renderCheckout`, matching qkit's `adapters.ts` shape exactly:

```ts
import { buildPayNowPayload } from "./paynow";
import type { VendorPaymentConfig } from "@/lib/types";

export type CheckoutView =
  | { type: "qr"; payload: string }
  | { type: "link"; url: string; label: string }
  | { type: "image"; url: string };

export function renderCheckout(
  config: VendorPaymentConfig,
  ctx: { amountCents: number; orderRef: string },
): CheckoutView | null {
  switch (config.kind) {
    case "paynow":
      return {
        type: "qr",
        payload: buildPayNowPayload({
          uen: config.uen ?? undefined,
          mobile: config.mobile ?? undefined,
          payeeName: config.payee_name ?? "",
          amountCents: ctx.amountCents,
          reference: ctx.orderRef,
        }),
      };
    case "pointer":
      if (config.url)
        return { type: "link", url: config.url, label: config.label ?? "" };
      if (config.qr_image_url)
        return { type: "image", url: config.qr_image_url };
      return null;
  }
}

/**
 * verification_method: 'auto' is schema-reserved — the vendor config write
 * schema never lets a vendor select it, so this is never called in v1.
 * Same dark-adapter precedent as qkit's unbuilt Stripe slot.
 */
export function autoVerify(): never {
  throw new Error("auto-verify not enabled");
}
```

The old `PaymentAdapter` interface and `paynowAdapter` export are removed
— paykit has exactly one config shape today (a flat row with a `kind`
discriminant), so a per-kind adapter _object_ was unnecessary ceremony;
qkit's own `adapters.ts` is a plain function for the same reason. Every
call site (`checkout/route.ts`) switches from `paynowAdapter.renderCheckout(...)`
to `renderCheckout(...)`.

### `src/lib/schemas.ts`

Replace `vendorPaymentConfigInputSchema` with a discriminated-union schema:

```ts
const payNowInputSchema = z.object({
  kind: z.literal("paynow"),
  payee_name: z.string().trim().min(1, "Payee name is required").max(100),
  uen: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z]{8,12}$/, "Invalid UEN")
    .optional()
    .or(z.literal("")),
  mobile: z
    .string()
    .trim()
    .regex(/^\+65[0-9]{8}$/, "Use +65XXXXXXXX")
    .optional()
    .or(z.literal("")),
});

const pointerInputSchema = z
  .object({
    kind: z.literal("pointer"),
    label: z.string().trim().min(1, "Label is required").max(60),
    url: z.string().trim().url("Enter a valid link").max(500).optional(),
    qr_image_url: z.string().trim().url().max(500).optional(),
  })
  .refine((v) => Boolean(v.url) !== Boolean(v.qr_image_url), {
    message: "Provide either a payment link or a QR image, not both",
    path: ["url"],
  });

export const vendorPaymentConfigInputSchema = z
  .discriminatedUnion("kind", [payNowInputSchema, pointerInputSchema])
  .transform((v) =>
    v.kind === "paynow"
      ? { ...v, uen: v.uen || undefined, mobile: v.mobile || undefined }
      : v,
  )
  .superRefine((v, ctx) => {
    if (v.kind === "paynow" && Boolean(v.uen) === Boolean(v.mobile)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either a UEN or a mobile number, not both",
        path: ["uen"],
      });
    }
  });

export type VendorPaymentConfigInput = z.infer<
  typeof vendorPaymentConfigInputSchema
>;
```

(This preserves the exact validation behavior of the current PayNow-only
schema — same UEN/mobile regexes, same "exactly one of" refinement — just
nested under the `paynow` branch, plus the new `pointer` branch.)

### `src/app/dashboard/config/actions.ts` and `payment-config-form.tsx`

`saveConfigAction` parses `kind` from the form data first, then validates
against the discriminated schema, then upserts all the new columns
(nulling out the fields that don't apply to the chosen kind — e.g. a
`paynow` save explicitly sets `label`/`url`/`qr_image_url` to `null`, and a
`pointer` save sets `payee_name`/`uen`/`mobile` to `null`, so switching
kind never leaves stale data from the previous kind in the row).

`PaymentConfigForm` gets qkit's `payment-section.tsx` radio-card picker
ported in (2 options instead of qkit's 3 — no `"none"`), with paykit's own
`ImageUploader` (`bucket="vendor-images"`, `pathPrefix={vendorId}`) wired
into the QR-image sub-option in place of qkit's `ImageUploader` call. The
existing PayNow fields (payee name, UEN/mobile radio, QR preview) become
the `kind === "paynow"` branch, functionally unchanged from today.

### `src/app/api/v1/checkout/route.ts`

`renderCheckout` can now return `null` (a `pointer` config with neither
`url` nor `qr_image_url` set — shouldn't happen given the form's own
validation, but the API is a separate trust boundary and must not assume
the dashboard's validation is the only path data arrives through). A
`null` result returns `422 { error: "vendor payment config is incomplete" }`,
the same status code family already used for "vendor has no PayNow
config."

The insert changes from a single `qr_payload` column to storing whichever
of the three `CheckoutView` fields apply. **Reuses the existing
`qr_payload` column as a generic "checkout payload" store** (renamed in
meaning, not in the DB — a migration to rename the column is out of scope
for this spec; `qr_payload` holds the QR payload for `type: "qr"`, the URL
for `type: "link"`, and the image URL for `type: "image"` — a `text` column
already, no schema change needed). The response shape changes from
`{transaction_id, qr_payload}` to a discriminated shape mirroring
`CheckoutView`:

```ts
export const checkoutResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("qr"),
    transaction_id: uuidSchema,
    payload: z.string().min(1),
  }),
  z.object({
    type: z.literal("link"),
    transaction_id: uuidSchema,
    url: z.string().url(),
    label: z.string(),
  }),
  z.object({
    type: z.literal("image"),
    transaction_id: uuidSchema,
    url: z.string().url(),
  }),
]);
```

### `src/app/api/v1/vendors/[vendor_id]/config/route.ts`

Selects `kind, payee_name, label` instead of just `payee_name`; returns:

```ts
export const vendorConfigResponseSchema = z.object({
  has_config: z.boolean(),
  display_name: z.string().nullable(),
});
```

`display_name` is `data.kind === "paynow" ? data.payee_name : data.label`
(or `null` when `!data`).

## Testing

- `src/lib/schemas.test.ts`: existing PayNow-shape tests move under an
  explicit `kind: "paynow"` input; add `pointer`-shape tests (valid link,
  valid QR image, rejects both-set, rejects neither-set, rejects empty
  label).
- `src/lib/payments/adapter.test.ts`: existing PayNow tests adapt to the
  new `renderCheckout` function signature (was `paynowAdapter.renderCheckout`);
  add `pointer`+url → `link`, `pointer`+qr_image_url → `image`,
  `pointer` with neither → `null`.
- `src/app/api/v1/checkout/route.test.ts`: existing "creates a checkout"
  test asserts the new `{type: "qr", payload}` response shape instead of
  `{qr_payload}`; add a `pointer`-config checkout test (asserts `{type:
"link", url, label}`); add a 422 test for an incomplete `pointer` config
  (`renderCheckout` returns `null`).
- `src/app/api/v1/vendors/[vendor_id]/config/route.test.ts`: existing test
  asserts `display_name` instead of `payee_name`; add a `pointer`-config
  case asserting `display_name` comes from `label`.
- `src/app/dashboard/config/actions.test.ts` and
  `payment-config-form.dom.test.tsx`: existing PayNow-path tests adapt to
  the `kind`-tagged input shape; add pointer-path tests (renders the
  picker, switches sections, saves a link config, saves a QR-image config
  via `ImageUploader`).

## Out of scope

- Wiring qkit to call paykit (T1) — separate, later, cross-repo spec.
- The reserved `stripe`/HitPay-connect auto-verify feature — separate,
  later spec (this spec only adds the manual, BYO `pointer` kind; the
  `verification_method` column stays `'manual'`-only exactly as today).
- Renaming the `qr_payload` DB column to something generic — deferred;
  its _meaning_ generalizes in this spec, its name doesn't, to keep the
  migration additive-only.

## Self-review

- No placeholders/TBDs.
- Internally consistent: every file section operates on the same `kind`
  discriminant and the same `CheckoutView`/`PaymentConfigKind` types; no
  code path still assumes PayNow-only.
- Scope: single cohesive change (add the `pointer` kind end-to-end:
  schema, DB, adapter, API, dashboard UI) — explicitly excludes T1 and the
  HitPay feature, both separate specs.
- Ambiguity check: the `display_name` derivation rule is explicit
  (`payee_name` for paynow, `label` for pointer) rather than left
  implicit; the checkout-insert column reuse (`qr_payload` stores
  non-QR payloads too) is called out explicitly rather than silently
  assumed.
