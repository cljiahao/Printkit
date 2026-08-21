# paykit Multi-Method BYO Payment Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second payment-method kind (`pointer` — a vendor's own payment link or QR image) alongside paykit's existing `paynow` kind, porting the proven discriminated-union pattern already shipped in qkit (`src/lib/payments/adapters.ts`), end-to-end: DB migration, types, schema validation, checkout adapter, both public API routes, and the dashboard config form.

**Architecture:** `vendor_payment_config` grows a `kind` column plus nullable `label`/`url`/`qr_image_url` columns (additive migration). `renderCheckout` becomes a plain function that switches on `kind` (replacing the single-purpose `paynowAdapter` object). `vendorPaymentConfigInputSchema` becomes a Zod discriminated union on `kind`. Both public API routes' response shapes change (`POST /checkout` returns a discriminated `{type, ...}` instead of bare `qr_payload`; `GET /vendors/{id}/config` returns `display_name` instead of `payee_name`) — both are breaking changes, safe today because paykit has zero live callers. The dashboard config form gets a 2-option radio-card picker (ported from qkit's `payment-section.tsx`, minus its "no payment" option) wired to paykit's existing `ImageUploader` for the QR-image path.

**Tech Stack:** Next.js 16 App Router (server actions + route handlers), TypeScript strict, Zod discriminated unions, Supabase Postgres (RLS), Vitest + Testing Library.

## Global Constraints

- No change in this plan touches qkit's repo or wires qkit to paykit's API — that's a separate, later, cross-repo spec (T1), explicitly not started here.
- No change in this plan builds the HitPay/auto-verify feature — `verification_method` stays `'manual'`-only exactly as today.
- Every file this plan touches is listed in the design spec at `docs/superpowers/specs/2026-07-22-paykit-multi-method-byo-design.md`.
- `pnpm check` and `pnpm test` must pass after every task.
- The Supabase migration (Task 1) cannot be applied or tested against a live database in this environment (no `.env.local` Supabase credentials configured in this sandbox, confirmed in an earlier session) — it is written and reviewed for correctness, not executed. Flag this honestly rather than claiming it was verified live.

---

### Task 1: Additive DB migration for the `pointer` kind

**Files:**

- Create: `supabase/migrations/0003_paykit_multi_method.sql`

**Interfaces:**

- Consumes: nothing (pure SQL).
- Produces: `paykit.vendor_payment_config` gains `kind text not null default 'paynow'`, `label text`, `url text`, `qr_image_url text`; `payee_name` becomes nullable. Every later task's TypeScript types (Task 2) must exactly match these column names and nullability.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0003_paykit_multi_method.sql`:

```sql
-- Adds the `pointer` payment-method kind (a vendor's own payment link or QR
-- image) alongside the existing `paynow` kind. Additive only — no column
-- drops, no data loss. Existing rows are all implicitly `kind = 'paynow'`
-- via the column default, so no backfill UPDATE is needed.
-- See docs/superpowers/specs/2026-07-22-paykit-multi-method-byo-design.md

alter table paykit.vendor_payment_config
  add column kind text not null default 'paynow' check (kind in ('paynow', 'pointer')),
  add column label text,
  add column url text,
  add column qr_image_url text;

alter table paykit.vendor_payment_config
  alter column payee_name drop not null;

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

-- Extend the existing column-scoped grants (see 0001_paykit_core.sql) to
-- cover the new columns. `plan` stays excluded — service-role only.
grant insert (vendor_id, kind, uen, mobile, payee_name, label, url, qr_image_url, verification_method)
  on paykit.vendor_payment_config to authenticated;
grant update (kind, uen, mobile, payee_name, label, url, qr_image_url, verification_method)
  on paykit.vendor_payment_config to authenticated;
```

- [ ] **Step 2: Review, don't execute**

This environment has no live Supabase connection (no `.env.local` credentials). Do not attempt `supabase db push` or the `/supabase-migrate` skill here — there is nothing to apply it to. Re-read the SQL once for syntax sanity (matching `0001_paykit_core.sql`'s style: lowercase keywords, `paykit.` schema-qualified table names) and move on. This migration gets applied for real the next time this repo is deployed against the shared Supabase project, same as every other migration in `supabase/migrations/`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_paykit_multi_method.sql
git commit -m "feat: add pointer payment-method kind migration"
```

---

### Task 2: Update `types.ts` for the new columns and `PaymentConfigKind`

**Files:**

- Modify: `src/lib/types.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `PaymentConfigKind = "paynow" | "pointer"`, and `VendorPaymentConfig` with `kind: PaymentConfigKind`, `payee_name: string | null` (was `string`), `label: string | null`, `url: string | null`, `qr_image_url: string | null` — every later task (adapter, schemas, routes, form) imports and matches this exact shape.

- [ ] **Step 1: Update `VendorPaymentConfig` and the `Database` insert/update types**

In `src/lib/types.ts`, replace:

```ts
export type VendorPaymentConfig = {
  vendor_id: string;
  uen: string | null;
  mobile: string | null;
  payee_name: string;
  verification_method: VerificationMethod;
  plan: VendorPlan;
  created_at: string;
  updated_at: string;
};
```

with:

```ts
export type PaymentConfigKind = "paynow" | "pointer";

export type VendorPaymentConfig = {
  vendor_id: string;
  kind: PaymentConfigKind;
  uen: string | null;
  mobile: string | null;
  payee_name: string | null;
  label: string | null;
  url: string | null;
  qr_image_url: string | null;
  verification_method: VerificationMethod;
  plan: VendorPlan;
  created_at: string;
  updated_at: string;
};
```

Then update `Database.paykit.Tables.vendor_payment_config`'s `Insert` and `Update` shapes. Replace:

```ts
        Insert: {
          vendor_id: string;
          uen?: string | null;
          mobile?: string | null;
          payee_name: string;
          verification_method?: VerificationMethod;
          plan?: VendorPlan;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          uen?: string | null;
          mobile?: string | null;
          payee_name?: string;
          verification_method?: VerificationMethod;
          plan?: VendorPlan;
          updated_at?: string;
        };
```

with:

```ts
        Insert: {
          vendor_id: string;
          kind?: PaymentConfigKind;
          uen?: string | null;
          mobile?: string | null;
          payee_name?: string | null;
          label?: string | null;
          url?: string | null;
          qr_image_url?: string | null;
          verification_method?: VerificationMethod;
          plan?: VendorPlan;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          kind?: PaymentConfigKind;
          uen?: string | null;
          mobile?: string | null;
          payee_name?: string | null;
          label?: string | null;
          url?: string | null;
          qr_image_url?: string | null;
          verification_method?: VerificationMethod;
          plan?: VendorPlan;
          updated_at?: string;
        };
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: FAILS with errors across `adapter.ts`, `schemas.ts`, `payment-config-form.tsx`, and their tests — every consumer of the old flat `VendorPaymentConfig` shape now has a type error. This is expected; each subsequent task fixes its own file. Do not fix them here — just confirm the type change itself compiles in isolation by checking the error list only mentions _other_ files, not `types.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add PaymentConfigKind and pointer columns to VendorPaymentConfig"
```

(Committing here is safe even though the repo doesn't typecheck yet — the pre-commit hook's `typecheck` step will fail. If it does, that's expected per Step 2; every remaining task in this plan is required before the repo is green again. If your git hooks block this commit, skip ahead and squash-verify at Task 9 instead — do not use `--no-verify`. In practice: proceed through Tasks 3-8 first, then return and commit Tasks 1-2 together with the rest once the full repo compiles, OR commit each task as its code lands and accept that intermediate commits between now and Task 8 may fail the hook — resolve by doing all of Tasks 1-8's file edits before the _first_ commit in this plan, matching the pattern used in the 2026-07-22 freemium-nudge plan.)

---

### Task 3: Generalize `renderCheckout` in `adapter.ts`

**Files:**

- Modify: `src/lib/payments/adapter.ts`
- Modify: `src/lib/payments/adapter.test.ts`

**Interfaces:**

- Consumes: `VendorPaymentConfig` (Task 2), `buildPayNowPayload` from `./paynow` (unchanged).
- Produces: `CheckoutView = {type:"qr",payload} | {type:"link",url,label} | {type:"image",url}` and `renderCheckout(config, ctx): CheckoutView | null` — Task 5 (checkout route) imports both.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/lib/payments/adapter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderCheckout, autoVerify } from "./adapter";
import type { VendorPaymentConfig } from "@/lib/types";

const BASE = {
  vendor_id: "11111111-1111-1111-1111-111111111111",
  verification_method: "manual" as const,
  plan: "free" as const,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const paynowConfig: VendorPaymentConfig = {
  ...BASE,
  kind: "paynow",
  uen: "53312345A",
  mobile: null,
  payee_name: "Kopitiam Cart",
  label: null,
  url: null,
  qr_image_url: null,
};

describe("renderCheckout — paynow", () => {
  it("renders a QR checkout view from a UEN config", () => {
    const view = renderCheckout(paynowConfig, {
      amountCents: 450,
      orderRef: "order-1",
    });
    expect(view).not.toBeNull();
    expect(view?.type).toBe("qr");
    expect((view as { payload: string }).payload).toContain("SG.PAYNOW");
    expect((view as { payload: string }).payload).toContain("53312345A");
  });

  it("renders a QR checkout view from a mobile config", () => {
    const view = renderCheckout(
      { ...paynowConfig, uen: null, mobile: "+6591234567" },
      { amountCents: 100, orderRef: "order-2" },
    );
    expect((view as { payload: string }).payload).toContain("+6591234567");
  });
});

describe("renderCheckout — pointer", () => {
  const pointerBase: VendorPaymentConfig = {
    ...BASE,
    kind: "pointer",
    uen: null,
    mobile: null,
    payee_name: null,
    label: "Pay with PayLah",
    url: null,
    qr_image_url: null,
  };

  it("renders a link checkout view when url is set", () => {
    const view = renderCheckout(
      { ...pointerBase, url: "https://pay.example/kopitiam" },
      { amountCents: 450, orderRef: "order-3" },
    );
    expect(view).toEqual({
      type: "link",
      url: "https://pay.example/kopitiam",
      label: "Pay with PayLah",
    });
  });

  it("renders an image checkout view when qr_image_url is set", () => {
    const view = renderCheckout(
      { ...pointerBase, qr_image_url: "https://cdn.example/qr.webp" },
      { amountCents: 450, orderRef: "order-4" },
    );
    expect(view).toEqual({
      type: "image",
      url: "https://cdn.example/qr.webp",
    });
  });

  it("returns null when neither url nor qr_image_url is set", () => {
    const view = renderCheckout(pointerBase, {
      amountCents: 450,
      orderRef: "order-5",
    });
    expect(view).toBeNull();
  });
});

describe("autoVerify", () => {
  it("throws — schema-reserved, not enabled in v1", () => {
    expect(() => autoVerify()).toThrow("auto-verify not enabled");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/payments/adapter.test.ts`
Expected: FAIL — `renderCheckout` is not exported by `./adapter` yet (current file exports `paynowAdapter`).

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/lib/payments/adapter.ts`:

```ts
import { buildPayNowPayload } from "./paynow";
import type { VendorPaymentConfig } from "@/lib/types";

export type CheckoutView =
  | { type: "qr"; payload: string }
  | { type: "link"; url: string; label: string }
  | { type: "image"; url: string };

/**
 * Ported from qkit's own `src/lib/payments/adapters.ts` — same shape,
 * same "extract, don't rebuild" precedent paykit's PayNow engine itself
 * followed. Returns null for a `pointer` config missing both destinations
 * — callers treat null as "checkout not available," no throw.
 */
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/payments/adapter.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit** — deferred to Task 8 per Task 2 Step 3's note (repo won't fully typecheck until Task 8 lands). Continue to Task 4.

---

### Task 4: Discriminated-union `vendorPaymentConfigInputSchema`

**Files:**

- Modify: `src/lib/schemas.ts`
- Modify: `src/lib/schemas.test.ts`

**Interfaces:**

- Consumes: nothing new (Zod only).
- Produces: `vendorPaymentConfigInputSchema` (discriminated on `kind`), `VendorPaymentConfigInput` type — Task 7 (`actions.ts`) parses form data against this.

- [ ] **Step 1: Write the failing test**

In `src/lib/schemas.test.ts`, replace the `describe("vendorPaymentConfigInputSchema", ...)` block (keep `issueRefundInputSchema`'s block and the profile-settings `describe` blocks below it untouched):

```ts
describe("vendorPaymentConfigInputSchema", () => {
  describe("kind: paynow", () => {
    it("accepts a valid UEN-only config", () => {
      const parsed = vendorPaymentConfigInputSchema.safeParse({
        kind: "paynow",
        payee_name: "Kopitiam Cart",
        uen: "53312345A",
        mobile: "",
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts a valid mobile-only config", () => {
      const parsed = vendorPaymentConfigInputSchema.safeParse({
        kind: "paynow",
        payee_name: "Kopitiam Cart",
        uen: "",
        mobile: "+6591234567",
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects both uen and mobile set", () => {
      const parsed = vendorPaymentConfigInputSchema.safeParse({
        kind: "paynow",
        payee_name: "Kopitiam Cart",
        uen: "53312345A",
        mobile: "+6591234567",
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects neither uen nor mobile set", () => {
      const parsed = vendorPaymentConfigInputSchema.safeParse({
        kind: "paynow",
        payee_name: "Kopitiam Cart",
        uen: "",
        mobile: "",
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects an invalid UEN format", () => {
      const parsed = vendorPaymentConfigInputSchema.safeParse({
        kind: "paynow",
        payee_name: "Kopitiam Cart",
        uen: "!!!",
        mobile: "",
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects an empty payee name", () => {
      const parsed = vendorPaymentConfigInputSchema.safeParse({
        kind: "paynow",
        payee_name: "",
        uen: "53312345A",
        mobile: "",
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe("kind: pointer", () => {
    it("accepts a valid payment-link config", () => {
      const parsed = vendorPaymentConfigInputSchema.safeParse({
        kind: "pointer",
        label: "Pay with PayLah",
        url: "https://pay.example/kopitiam",
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts a valid QR-image config", () => {
      const parsed = vendorPaymentConfigInputSchema.safeParse({
        kind: "pointer",
        label: "Scan our QR",
        qr_image_url: "https://cdn.example/qr.webp",
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects both url and qr_image_url set", () => {
      const parsed = vendorPaymentConfigInputSchema.safeParse({
        kind: "pointer",
        label: "Pay",
        url: "https://pay.example/kopitiam",
        qr_image_url: "https://cdn.example/qr.webp",
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects neither url nor qr_image_url set", () => {
      const parsed = vendorPaymentConfigInputSchema.safeParse({
        kind: "pointer",
        label: "Pay",
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects an empty label", () => {
      const parsed = vendorPaymentConfigInputSchema.safeParse({
        kind: "pointer",
        label: "",
        url: "https://pay.example/kopitiam",
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects an invalid url", () => {
      const parsed = vendorPaymentConfigInputSchema.safeParse({
        kind: "pointer",
        label: "Pay",
        url: "not-a-url",
      });
      expect(parsed.success).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/schemas.test.ts`
Expected: FAIL — the current schema has no `kind` discriminant, so every `kind: "paynow"`/`kind: "pointer"` input either fails to parse as expected or the pointer tests fail entirely (no pointer branch exists).

- [ ] **Step 3: Write minimal implementation**

In `src/lib/schemas.ts`, replace the existing `vendorPaymentConfigInputSchema` block (from `export const vendorPaymentConfigInputSchema = z` through its closing `);` and the `export type VendorPaymentConfigInput = ...` line) with:

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/schemas.test.ts`
Expected: PASS (all `vendorPaymentConfigInputSchema` tests — 12 paynow+pointer cases — plus the pre-existing `issueRefundInputSchema` and profile-settings schema tests, unaffected).

- [ ] **Step 5: Commit** — deferred to Task 8. Continue to Task 5.

---

### Task 5: `POST /api/v1/checkout` — discriminated response, pointer support

**Files:**

- Modify: `src/app/api/v1/checkout/route.ts`
- Modify: `src/app/api/v1/checkout/route.test.ts`
- Modify: `src/lib/api-schemas.ts`

**Interfaces:**

- Consumes: `renderCheckout`, `CheckoutView` (Task 3).
- Produces: `checkoutResponseSchema` (discriminated on `type`) — no later task in this plan consumes it directly, but it is the public contract calling kits will eventually rely on (T1, out of scope here).

- [ ] **Step 1: Update `api-schemas.ts`'s response schema**

In `src/lib/api-schemas.ts`, replace:

```ts
export const checkoutResponseSchema = z.object({
  transaction_id: z.string().uuid(),
  qr_payload: z.string().min(1),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
```

with:

```ts
export const checkoutResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("qr"),
    transaction_id: z.string().uuid(),
    payload: z.string().min(1),
  }),
  z.object({
    type: z.literal("link"),
    transaction_id: z.string().uuid(),
    url: z.string().url(),
    label: z.string(),
  }),
  z.object({
    type: z.literal("image"),
    transaction_id: z.string().uuid(),
    url: z.string().url(),
  }),
]);
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
```

- [ ] **Step 2: Write the failing test**

In `src/app/api/v1/checkout/route.test.ts`:

1. Update the `"creates a checkout and returns a QR payload"` test's assertion (find `expect(await res.json()).toEqual({ transaction_id: "tx1", qr_payload: "0002...6304ABCD" });` and replace with):

```ts
expect(await res.json()).toEqual({
  type: "qr",
  transaction_id: "tx1",
  payload: "0002...6304ABCD",
});
```

2. Update `insertSingle`'s default mock in `beforeEach` — find:

```ts
insertSingle.mockReset().mockResolvedValue({
  data: { id: "tx1", qr_payload: "0002...6304ABCD" },
  error: null,
});
```

replace with:

```ts
insertSingle.mockReset().mockResolvedValue({
  data: { id: "tx1", qr_payload: "0002...6304ABCD", type: "qr" },
  error: null,
});
```

(The mock's `type` field is unused by the route — Step 4's implementation determines the response `type` from `view.type`, computed in-memory, not from a DB column. It's included here only so the mock object's shape doesn't look suspiciously bare; harmless either way.)

3. Add a pointer-config checkout test and a 422-incomplete-pointer test, right after the "creates a checkout..." test:

```ts
it("creates a link checkout for a pointer-kind vendor", async () => {
  configMaybeSingle.mockResolvedValue({
    data: {
      vendor_id: "11111111-1111-1111-1111-111111111111",
      kind: "pointer",
      uen: null,
      mobile: null,
      payee_name: null,
      label: "Pay with PayLah",
      url: "https://pay.example/kopitiam",
      qr_image_url: null,
      verification_method: "manual",
      plan: "free",
    },
    error: null,
  });
  insertSingle.mockResolvedValue({
    data: {
      id: "tx2",
      qr_payload: "https://pay.example/kopitiam",
      type: "link",
    },
    error: null,
  });
  const res = await POST(
    req({
      vendor_id: "11111111-1111-1111-1111-111111111111",
      amount_cents: 450,
      order_ref: "A-002",
    }),
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    type: "link",
    transaction_id: "tx2",
    url: "https://pay.example/kopitiam",
    label: "Pay with PayLah",
  });
});

it("422s when a pointer-kind vendor's config is incomplete", async () => {
  configMaybeSingle.mockResolvedValue({
    data: {
      vendor_id: "11111111-1111-1111-1111-111111111111",
      kind: "pointer",
      uen: null,
      mobile: null,
      payee_name: null,
      label: "Pay with PayLah",
      url: null,
      qr_image_url: null,
      verification_method: "manual",
      plan: "free",
    },
    error: null,
  });
  const res = await POST(
    req({
      vendor_id: "11111111-1111-1111-1111-111111111111",
      amount_cents: 450,
      order_ref: "A-003",
    }),
  );
  expect(res.status).toBe(422);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/app/api/v1/checkout/route.test.ts`
Expected: FAIL — `route.ts` still imports `paynowAdapter` (removed in Task 3) and returns the old `{transaction_id, qr_payload}` shape.

- [ ] **Step 4: Write minimal implementation**

Replace the full contents of `src/app/api/v1/checkout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyKitAuth } from "@/lib/kit-auth";
import { checkoutRequestSchema } from "@/lib/api-schemas";
import { renderCheckout } from "@/lib/payments/adapter";
import type { VendorPaymentConfig } from "@/lib/types";

export async function POST(request: Request) {
  const auth = await verifyKitAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const { vendor_id, amount_cents, order_ref } = parsed.data;

  const supabase = await createServiceClient();

  const { data: config, error: configError } = await supabase
    .from("vendor_payment_config")
    .select("*")
    .eq("vendor_id", vendor_id)
    .maybeSingle();
  if (configError) {
    console.error("checkout: config read failed", configError.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  if (!config) {
    return NextResponse.json(
      { error: "vendor has no PayNow config" },
      { status: 422 },
    );
  }

  const view = renderCheckout(config as VendorPaymentConfig, {
    amountCents: amount_cents,
    orderRef: order_ref,
  });
  if (!view) {
    return NextResponse.json(
      { error: "vendor payment config is incomplete" },
      { status: 422 },
    );
  }

  // qr_payload is a generic "checkout payload" store — the QR payload for
  // type "qr", the link/image URL for "link"/"image". Column name unchanged
  // (additive-only migration), meaning generalized. See the design spec.
  const payloadValue = view.type === "qr" ? view.payload : view.url;

  const { data: inserted, error: insertError } = await supabase
    .from("transactions")
    .insert({
      vendor_id,
      kit_slug: auth.kitSlug,
      order_ref,
      amount_cents,
      qr_payload: payloadValue,
    })
    .select("id, qr_payload")
    .single();
  if (insertError || !inserted) {
    console.error("checkout: insert failed", insertError?.message);
    return NextResponse.json(
      { error: "Could not create checkout" },
      { status: 503 },
    );
  }

  if (view.type === "qr") {
    return NextResponse.json({
      type: "qr",
      transaction_id: inserted.id,
      payload: inserted.qr_payload,
    });
  }
  if (view.type === "link") {
    return NextResponse.json({
      type: "link",
      transaction_id: inserted.id,
      url: inserted.qr_payload,
      label: view.label,
    });
  }
  return NextResponse.json({
    type: "image",
    transaction_id: inserted.id,
    url: inserted.qr_payload,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/app/api/v1/checkout/route.test.ts`
Expected: PASS (9 tests: create-qr+200, create-link+200, 422-incomplete-pointer, 401, 422-no-config, 400, 503-config, 200-past-old-cap, 503-insert).

- [ ] **Step 6: Commit** — deferred to Task 8. Continue to Task 6.

---

### Task 6: `GET /api/v1/vendors/{id}/config` — `display_name` rename

**Files:**

- Modify: `src/app/api/v1/vendors/[vendor_id]/config/route.ts`
- Modify: `src/app/api/v1/vendors/[vendor_id]/config/route.test.ts`
- Modify: `src/lib/api-schemas.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `vendorConfigResponseSchema` with `display_name` instead of `payee_name`.

- [ ] **Step 1: Update `api-schemas.ts`'s response schema**

Replace:

```ts
export const vendorConfigResponseSchema = z.object({
  has_config: z.boolean(),
  payee_name: z.string().nullable(),
});
export type VendorConfigResponse = z.infer<typeof vendorConfigResponseSchema>;
```

with:

```ts
export const vendorConfigResponseSchema = z.object({
  has_config: z.boolean(),
  display_name: z.string().nullable(),
});
export type VendorConfigResponse = z.infer<typeof vendorConfigResponseSchema>;
```

- [ ] **Step 2: Write the failing test**

Replace the full contents of `src/app/api/v1/vendors/[vendor_id]/config/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

const { verifyKitAuthMock, maybeSingleMock, createServiceClientMock } =
  vi.hoisted(() => ({
    verifyKitAuthMock: vi.fn(),
    maybeSingleMock: vi.fn(),
    createServiceClientMock: vi.fn(),
  }));

vi.mock("@/lib/kit-auth", () => ({ verifyKitAuth: verifyKitAuthMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));

beforeEach(() => {
  verifyKitAuthMock.mockReset().mockResolvedValue({ kitSlug: "qkit" });
  createServiceClientMock.mockReset().mockResolvedValue({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
    }),
  });
  maybeSingleMock.mockReset();
});

const VENDOR_ID = "11111111-1111-1111-1111-111111111111";

function req() {
  return new Request(`http://localhost/api/v1/vendors/${VENDOR_ID}/config`, {
    headers: { authorization: "Bearer qkit:secret" },
  });
}
function ctx(vendor_id: string = VENDOR_ID) {
  return { params: Promise.resolve({ vendor_id }) };
}

describe("GET /api/v1/vendors/[vendor_id]/config", () => {
  it("reports has_config true + display_name from payee_name for a paynow config", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { kind: "paynow", payee_name: "Kopitiam Cart", label: null },
      error: null,
    });
    const res = await GET(req(), ctx());
    expect(await res.json()).toEqual({
      has_config: true,
      display_name: "Kopitiam Cart",
    });
  });
  it("reports display_name from label for a pointer config", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { kind: "pointer", payee_name: null, label: "Pay with PayLah" },
      error: null,
    });
    const res = await GET(req(), ctx());
    expect(await res.json()).toEqual({
      has_config: true,
      display_name: "Pay with PayLah",
    });
  });
  it("reports has_config false when unconfigured", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await GET(req(), ctx());
    expect(await res.json()).toEqual({
      has_config: false,
      display_name: null,
    });
  });
  it("401s when unauthorized", async () => {
    verifyKitAuthMock.mockResolvedValue(null);
    expect((await GET(req(), ctx())).status).toBe(401);
  });
  it("400s for a malformed (non-uuid) vendor_id, without querying the DB", async () => {
    const res = await GET(req(), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });
  it("503s when the DB read fails", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).not.toMatch(/connection reset/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run "src/app/api/v1/vendors/[vendor_id]/config/route.test.ts"`
Expected: FAIL — `route.ts` still selects only `payee_name` and returns `{has_config, payee_name}`.

- [ ] **Step 4: Write minimal implementation**

Replace the full contents of `src/app/api/v1/vendors/[vendor_id]/config/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyKitAuth } from "@/lib/kit-auth";
import { uuidSchema } from "@/lib/api-schemas";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ vendor_id: string }> },
) {
  const auth = await verifyKitAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { vendor_id } = await params;
  if (!uuidSchema.safeParse(vendor_id).success) {
    return NextResponse.json({ error: "Invalid vendor id" }, { status: 400 });
  }
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("vendor_payment_config")
    .select("kind, payee_name, label")
    .eq("vendor_id", vendor_id)
    .maybeSingle();
  if (error) {
    console.error("vendor config: read failed", error.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  const display_name = data
    ? data.kind === "paynow"
      ? data.payee_name
      : data.label
    : null;

  return NextResponse.json({
    has_config: Boolean(data),
    display_name,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run "src/app/api/v1/vendors/[vendor_id]/config/route.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit** — deferred to Task 8. Continue to Task 7.

---

### Task 7: `actions.ts` — parse `kind`, upsert all columns

**Files:**

- Modify: `src/app/dashboard/config/actions.ts`
- Modify: `src/app/dashboard/config/actions.test.ts`

**Interfaces:**

- Consumes: `vendorPaymentConfigInputSchema` (Task 4).
- Produces: `saveConfigAction(prev, formData)` unchanged signature — Task 8's form still calls it the same way, just now sends a `kind` field plus the fields for whichever kind is selected.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/app/dashboard/config/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUserMock, upsertMock, createServerClientMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  upsertMock: vi.fn(),
  createServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: createServerClientMock,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: "v1" } } });
  upsertMock.mockReset().mockResolvedValue({ error: null });
  createServerClientMock.mockReset().mockResolvedValue({
    auth: { getUser: getUserMock },
    from: () => ({ upsert: upsertMock }),
  });
});

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("saveConfigAction", () => {
  it("saves a valid UEN paynow config, nulling pointer fields", async () => {
    const { saveConfigAction } = await import("./actions");
    const result = await saveConfigAction(
      { status: "idle" },
      formData({
        kind: "paynow",
        payee_name: "Kopitiam Cart",
        uen: "53312345A",
        mobile: "",
      }),
    );
    expect(result.status).toBe("ok");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_id: "v1",
        kind: "paynow",
        uen: "53312345A",
        mobile: null,
        payee_name: "Kopitiam Cart",
        label: null,
        url: null,
        qr_image_url: null,
      }),
      { onConflict: "vendor_id" },
    );
  });

  it("returns an error for an invalid paynow config (both uen and mobile)", async () => {
    const { saveConfigAction } = await import("./actions");
    const result = await saveConfigAction(
      { status: "idle" },
      formData({
        kind: "paynow",
        payee_name: "Kopitiam Cart",
        uen: "53312345A",
        mobile: "+6591234567",
      }),
    );
    expect(result.status).toBe("error");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("saves a valid pointer config with a link, nulling paynow fields", async () => {
    const { saveConfigAction } = await import("./actions");
    const result = await saveConfigAction(
      { status: "idle" },
      formData({
        kind: "pointer",
        label: "Pay with PayLah",
        url: "https://pay.example/kopitiam",
        qr_image_url: "",
      }),
    );
    expect(result.status).toBe("ok");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_id: "v1",
        kind: "pointer",
        label: "Pay with PayLah",
        url: "https://pay.example/kopitiam",
        qr_image_url: null,
        payee_name: null,
        uen: null,
        mobile: null,
      }),
      { onConflict: "vendor_id" },
    );
  });

  it("returns an error for an invalid pointer config (neither url nor qr_image_url)", async () => {
    const { saveConfigAction } = await import("./actions");
    const result = await saveConfigAction(
      { status: "idle" },
      formData({ kind: "pointer", label: "Pay", url: "", qr_image_url: "" }),
    );
    expect(result.status).toBe("error");
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/dashboard/config/actions.test.ts`
Expected: FAIL — current `saveConfigAction` doesn't read `kind` from form data and only writes `payee_name`/`uen`/`mobile`.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/app/dashboard/config/actions.ts`:

```ts
"use server";

import { getVendorSession } from "@/lib/vendor-session";
import { vendorPaymentConfigInputSchema } from "@/lib/schemas";
import type { VendorPaymentConfig } from "@/lib/types";

export async function getConfig(): Promise<VendorPaymentConfig | null> {
  const { supabase, user } = await getVendorSession();
  const { data } = await supabase
    .from("vendor_payment_config")
    .select("*")
    .eq("vendor_id", user.id)
    .maybeSingle();
  return data;
}

export type SaveConfigState = {
  status: "idle" | "ok" | "error";
  message?: string;
};

export async function saveConfigAction(
  _prev: SaveConfigState,
  formData: FormData,
): Promise<SaveConfigState> {
  const { supabase, user } = await getVendorSession();
  const kind = formData.get("kind");
  const parsed = vendorPaymentConfigInputSchema.safeParse(
    kind === "pointer"
      ? {
          kind: "pointer",
          label: formData.get("label") ?? "",
          url: formData.get("url") || undefined,
          qr_image_url: formData.get("qr_image_url") || undefined,
        }
      : {
          kind: "paynow",
          payee_name: formData.get("payee_name") ?? "",
          uen: formData.get("uen") ?? "",
          mobile: formData.get("mobile") ?? "",
        },
  );
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const row =
    parsed.data.kind === "paynow"
      ? {
          vendor_id: user.id,
          kind: "paynow" as const,
          payee_name: parsed.data.payee_name,
          uen: parsed.data.uen ?? null,
          mobile: parsed.data.mobile ?? null,
          label: null,
          url: null,
          qr_image_url: null,
        }
      : {
          vendor_id: user.id,
          kind: "pointer" as const,
          payee_name: null,
          uen: null,
          mobile: null,
          label: parsed.data.label,
          url: parsed.data.url ?? null,
          qr_image_url: parsed.data.qr_image_url ?? null,
        };

  const { error } = await supabase
    .from("vendor_payment_config")
    .upsert(row, { onConflict: "vendor_id" });
  if (error) {
    console.error("saveConfigAction failed", error.message);
    return { status: "error", message: "Could not save. Try again." };
  }
  return { status: "ok" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/dashboard/config/actions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit** — deferred to Task 8. Continue to Task 8.

---

### Task 8: `PaymentConfigForm` — port qkit's 2-option picker

**Files:**

- Modify: `src/app/dashboard/config/payment-config-form.tsx`
- Modify: `src/app/dashboard/config/payment-config-form.dom.test.tsx`

**Interfaces:**

- Consumes: `saveConfigAction` (Task 7), `ImageUploader` from `@/components/image-uploader` (unchanged, existing component), `VendorPaymentConfig` (Task 2).
- Produces: nothing consumed by later tasks — leaf UI.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/app/dashboard/config/payment-config-form.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaymentConfigForm } from "./payment-config-form";

const { saveConfigActionMock } = vi.hoisted(() => ({
  saveConfigActionMock: vi.fn(),
}));

vi.mock("./actions", () => ({
  saveConfigAction: saveConfigActionMock,
}));
vi.mock("@/components/image-uploader", () => ({
  ImageUploader: () => <div data-testid="image-uploader" />,
}));

beforeEach(() => {
  saveConfigActionMock.mockReset();
});

describe("PaymentConfigForm", () => {
  it("defaults to the PayNow section, shows the UEN field, switches to mobile on toggle", () => {
    render(<PaymentConfigForm initial={null} vendorId="v1" />);
    expect(screen.getByLabelText("UEN")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /mobile/i }));
    expect(screen.getByLabelText("Mobile")).toBeInTheDocument();
  });

  it("renders a QR preview once payee name + identifier are filled", () => {
    render(<PaymentConfigForm initial={null} vendorId="v1" />);
    expect(document.querySelector("svg")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Payee name"), {
      target: { value: "Kopitiam Cart" },
    });
    fireEvent.change(screen.getByLabelText("UEN"), {
      target: { value: "53312345A" },
    });
    expect(document.querySelector("svg")).toBeInTheDocument();
  });

  it("renders a role=alert error message once the server action returns status: error", async () => {
    saveConfigActionMock.mockResolvedValue({
      status: "error",
      message: "Provide exactly one of UEN or mobile.",
    });
    const user = userEvent.setup();
    render(<PaymentConfigForm initial={null} vendorId="v1" />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /save payment config/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Provide exactly one of UEN or mobile.",
      );
    });
    expect(saveConfigActionMock).toHaveBeenCalledTimes(1);
  });

  it("switches to the pointer section and shows link/QR-image sub-options", async () => {
    const user = userEvent.setup();
    render(<PaymentConfigForm initial={null} vendorId="v1" />);

    await user.click(
      screen.getByRole("radio", { name: /payment link or qr image/i }),
    );

    expect(screen.getByLabelText("Button label")).toBeInTheDocument();
    expect(screen.getByLabelText("Payment link")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /qr image/i }));
    expect(screen.getByTestId("image-uploader")).toBeInTheDocument();
  });

  it("prefills the pointer section from an existing pointer config", () => {
    render(
      <PaymentConfigForm
        vendorId="v1"
        initial={{
          vendor_id: "v1",
          kind: "pointer",
          uen: null,
          mobile: null,
          payee_name: null,
          label: "Pay with PayLah",
          url: "https://pay.example/kopitiam",
          qr_image_url: null,
          verification_method: "manual",
          plan: "free",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        }}
      />,
    );
    expect(screen.getByLabelText("Button label")).toHaveValue(
      "Pay with PayLah",
    );
    expect(screen.getByLabelText("Payment link")).toHaveValue(
      "https://pay.example/kopitiam",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/dashboard/config/payment-config-form.dom.test.tsx`
Expected: FAIL — `PaymentConfigForm` doesn't accept a `vendorId` prop, has no kind picker, no pointer section, and the save button still says "Save PayNow config".

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/app/dashboard/config/payment-config-form.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import QRCode from "react-qr-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ImageUploader } from "@/components/image-uploader";
import { buildPayNowPayload } from "@/lib/payments/paynow";
import { saveConfigAction, type SaveConfigState } from "./actions";
import type { PaymentConfigKind, VendorPaymentConfig } from "@/lib/types";

type IdKind = "uen" | "mobile";
type PointerMode = "link" | "qr";

const KIND_OPTIONS: { k: PaymentConfigKind; label: string; hint: string }[] = [
  {
    k: "paynow",
    label: "PayNow QR",
    hint: "We generate a QR with the order amount already filled in.",
  },
  {
    k: "pointer",
    label: "Payment link or QR image",
    hint: "Qashier, HitPay, GrabPay for Business, Stripe Payment Links, or your bank's own QR: any of them work here.",
  },
];

export function PaymentConfigForm({
  initial,
  vendorId,
}: {
  initial: VendorPaymentConfig | null;
  vendorId: string;
}) {
  const [state, formAction, pending] = useActionState<
    SaveConfigState,
    FormData
  >(saveConfigAction, { status: "idle" });

  const [kind, setKind] = useState<PaymentConfigKind>(
    initial?.kind ?? "paynow",
  );

  // PayNow fields.
  const [idKind, setIdKind] = useState<IdKind>(
    initial?.mobile ? "mobile" : "uen",
  );
  const [idKindTouched, setIdKindTouched] = useState(
    Boolean(initial?.kind === "paynow"),
  );
  const [payeeName, setPayeeName] = useState(initial?.payee_name ?? "");
  const [uen, setUen] = useState(initial?.uen ?? "");
  const [mobile, setMobile] = useState(initial?.mobile ?? "");

  // Pointer fields.
  const [pointerMode, setPointerMode] = useState<PointerMode>(() =>
    initial?.kind === "pointer" && initial.qr_image_url && !initial.url
      ? "qr"
      : "link",
  );
  const [label, setLabel] = useState(initial?.label ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(
    initial?.qr_image_url ?? null,
  );

  const previewPayload =
    kind === "paynow" && payeeName && (idKind === "uen" ? uen : mobile)
      ? buildPayNowPayload({
          uen: idKind === "uen" ? uen : undefined,
          mobile: idKind === "mobile" ? mobile : undefined,
          payeeName,
          amountCents: 100,
          reference: "PREVIEW",
        })
      : null;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="kind" value={kind} />

      <RadioGroup
        value={kind}
        onValueChange={(v) => setKind(v as PaymentConfigKind)}
        className="gap-2.5"
      >
        {KIND_OPTIONS.map(({ k, label: optLabel, hint }) => {
          const selected = kind === k;
          return (
            <label
              key={k}
              className={
                selected
                  ? "flex cursor-pointer items-start gap-3 rounded-xl border border-primary bg-primary/5 px-4 py-3 ring-1 ring-primary/30"
                  : "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-secondary/50"
              }
            >
              <RadioGroupItem
                value={k}
                aria-label={optLabel}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{optLabel}</span>
                <span className="block text-xs text-muted-foreground">
                  {hint}
                </span>
              </span>
            </label>
          );
        })}
      </RadioGroup>

      {kind === "paynow" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="payee_name">Payee name</Label>
            <Input
              id="payee_name"
              name="payee_name"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              placeholder="Kopitiam Cart"
            />
          </div>

          <RadioGroup
            value={idKindTouched ? idKind : ""}
            onValueChange={(v) => {
              setIdKind(v as IdKind);
              setIdKindTouched(true);
            }}
            className="flex gap-4"
          >
            <span className="flex items-center gap-2">
              <RadioGroupItem value="uen" aria-label="Pay via UEN" /> UEN
            </span>
            <span className="flex items-center gap-2">
              <RadioGroupItem value="mobile" aria-label="Pay via mobile" />{" "}
              Mobile
            </span>
          </RadioGroup>

          {idKind === "uen" ? (
            <div className="space-y-2">
              <Label htmlFor="uen">UEN</Label>
              <Input
                id="uen"
                name="uen"
                value={uen}
                onChange={(e) => setUen(e.target.value)}
                placeholder="53312345A"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="mobile">Mobile</Label>
              <Input
                id="mobile"
                name="mobile"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="+6591234567"
              />
            </div>
          )}

          {previewPayload && (
            <div className="rounded-xl border p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Preview ($1.00 sample QR)
              </p>
              <QRCode value={previewPayload} size={160} />
            </div>
          )}
        </>
      )}

      {kind === "pointer" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="label">Button label</Label>
            <Input
              id="label"
              name="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Pay with PayLah"
            />
          </div>

          <RadioGroup
            value={pointerMode}
            onValueChange={(v) => setPointerMode(v as PointerMode)}
            className="flex gap-4"
          >
            <span className="flex items-center gap-2">
              <RadioGroupItem value="link" aria-label="Payment link" /> Payment
              link
            </span>
            <span className="flex items-center gap-2">
              <RadioGroupItem value="qr" aria-label="QR image" /> QR image
            </span>
          </RadioGroup>

          {pointerMode === "link" ? (
            <div className="space-y-2">
              <Label htmlFor="url">Payment link</Label>
              <Input
                id="url"
                name="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
              <p className="text-xs text-muted-foreground">
                Any https link: a Qashier/HitPay/GrabPay checkout, your
                bank&apos;s payment page, or a Stripe Payment Link.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>QR image</Label>
              <ImageUploader
                bucket="vendor-images"
                pathPrefix={vendorId}
                value={qrImageUrl}
                onChange={setQrImageUrl}
              />
              <input
                type="hidden"
                name="qr_image_url"
                value={qrImageUrl ?? ""}
              />
              <p className="text-xs text-muted-foreground">
                A static QR you already have: your GrabPay, PayLah, or bank QR
                code, photographed or screenshotted.
              </p>
            </div>
          )}
        </>
      )}

      {state.status === "error" && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      )}
      {state.status === "ok" && (
        <p className="text-sm font-medium text-emerald-600">Saved.</p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save payment config"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Update the page that renders this form**

`src/app/dashboard/config/page.tsx` calls `<PaymentConfigForm initial={config} />` — it needs the new `vendorId` prop. Read the file first, then add `vendorId={user.id}` (or whatever the page's session variable is named — check how `getVendorSession()`/`getConfig()` are called in that file) to the existing `<PaymentConfigForm>` call site.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/app/dashboard/config/payment-config-form.dom.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Full-repo typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors — this is the point where Tasks 1-8's cumulative changes make the whole repo compile again (Task 2's Step 2 intentionally left it broken).

- [ ] **Step 7: Full-repo check and test**

Run: `pnpm check && pnpm test`
Expected: both pass. If `pnpm check` flags formatting, run `pnpm format` and re-run.

- [ ] **Step 8: Update `AGENTS.md`'s data-model description**

Read `AGENTS.md`, find the `vendor_payment_config` bullet under `## Data model` (already mentions `plan` gating — this plan doesn't touch that sentence). Add a clause describing the new `kind` split, e.g. after the existing UEN/mobile sentence: `Since 2026-07-22, kind ('paynow'|'pointer') splits config into a generated PayNow QR or a vendor's own BYO payment link/QR image (see docs/superpowers/specs/2026-07-22-paykit-multi-method-byo-design.md); payee_name/uen/mobile apply only to 'paynow', label/url/qr_image_url only to 'pointer'.` This is a governance-file edit — `Edit` on `AGENTS.md` prompts for permission; approve when asked.

- [ ] **Step 9: Commit everything from Tasks 1-8 together**

Given Task 2's typecheck-break note, this plan's commits land as one coherent group once the repo is green:

```bash
git add supabase/migrations/0003_paykit_multi_method.sql src/lib/types.ts src/lib/payments/adapter.ts src/lib/payments/adapter.test.ts src/lib/schemas.ts src/lib/schemas.test.ts src/lib/api-schemas.ts src/app/api/v1/checkout/route.ts src/app/api/v1/checkout/route.test.ts "src/app/api/v1/vendors/[vendor_id]/config/route.ts" "src/app/api/v1/vendors/[vendor_id]/config/route.test.ts" src/app/dashboard/config/actions.ts src/app/dashboard/config/actions.test.ts src/app/dashboard/config/payment-config-form.tsx src/app/dashboard/config/payment-config-form.dom.test.tsx src/app/dashboard/config/page.tsx AGENTS.md
git commit -m "$(cat <<'EOF'
feat: add pointer payment-method kind — vendor BYO link/QR image

Ports qkit's proven pointer/paynow discriminated-union pattern into
paykit. Breaking changes to POST /checkout and GET /vendors/{id}/config
response shapes are safe today — paykit has zero live callers.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Final verification, spec/plan docs, push

**Files:**

- Add: `docs/superpowers/specs/2026-07-22-paykit-multi-method-byo-design.md` (already written and committed at brainstorming time — verify it's tracked)
- Add: `docs/superpowers/plans/2026-07-22-paykit-multi-method-byo.md` (this file)

- [ ] **Step 1: Confirm the spec and plan docs are committed**

Run: `git status`
Expected: if the spec/plan docs from the brainstorming/planning phase aren't yet committed, stage and commit them:

```bash
git add docs/superpowers/specs/2026-07-22-paykit-multi-method-byo-design.md docs/superpowers/plans/2026-07-22-paykit-multi-method-byo.md
git commit -m "$(cat <<'EOF'
docs: add multi-method BYO design spec and implementation plan

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Full suite one more time**

Run: `pnpm check && pnpm test`
Expected: clean.

- [ ] **Step 3: Confirm no leftover old-shape references**

Run: `grep -rn "paynowAdapter\|qr_payload: z.string" src test`
Expected: no output (confirms the old adapter export and old response schema are fully gone).

- [ ] **Step 4: Push**

```bash
git push origin main
```

Expected: push succeeds, harness pre-push hooks pass.
