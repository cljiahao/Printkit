# Payment Provider Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give paykit a pluggable `PaymentProvider` seam so that wiring in a real payment gateway later (for genuine tap-to-open-bank-app) is a config change plus one new provider implementation — not a redesign. Behavior is byte-for-byte unchanged until a provider other than the default is configured.

**Architecture:** `renderCheckout` (the existing pure EMVCo/pointer builder in `src/lib/payments/adapter.ts`) becomes the implementation behind a new `directProvider`, the sole entry in a provider registry selected by a `PAYKIT_PROVIDER` env var (default/fallback: `"direct"`). `src/app/api/v1/checkout/route.ts` calls `getProvider().createCheckout(...)` instead of `renderCheckout(...)` directly.

**Tech Stack:** Next.js 16 App Router (Route Handler), TypeScript strict, Vitest.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore` (AGENTS.md).
- paykit never touches funds — this plan does not change that; the default
  provider is the existing fund-free QR/link builder, unchanged (see
  [design spec](../../../qkit/docs/superpowers/specs/2026-08-13-paynow-tap-to-pay-design.md),
  qkit repo).
- No real third-party gateway is integrated in this plan — only the
  registry/interface and the one existing provider behind it. (The design
  spec's gateway shortlist is a separate, not-yet-approved follow-up.)
- Unset/unrecognized `PAYKIT_PROVIDER` must never fail a request — degrade
  to `direct` with a logged warning, matching this repo's existing
  degrade-don't-crash posture (e.g. `merqo-auth.ts`'s missing-secret
  handling).
- Work on a feature branch, never commit directly to `main`.
- Commit messages follow Conventional Commits.
- Run `pnpm check && pnpm test` before considering any task done.

---

### Task 0: Branch setup

**Files:** none

- [ ] **Step 1: Create and switch to a feature branch off `main`**

```bash
git fetch origin main
git checkout -b feat/payment-provider-seam origin/main
```

- [ ] **Step 2: Confirm baseline tests pass**

Run: `pnpm test`
Expected: all existing tests PASS.

---

### Task 1: Add the `PaymentProvider` interface, `directProvider`, and `getProvider()` selector

**Files:**

- Create: `src/lib/payments/provider.ts`
- Test: `src/lib/payments/provider.test.ts`

**Interfaces:**

- Consumes: `renderCheckout(config, ctx): CheckoutView | null` from
  `./adapter` (existing, unchanged) and `VendorPaymentConfig`, `TxStatus`
  from `@/lib/types` (existing).
- Produces: `PaymentProvider` interface, `directProvider: PaymentProvider`,
  `getProvider(): PaymentProvider` — consumed by Task 2's `route.ts`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/payments/provider.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { getProvider, directProvider } from "./provider";
import type { VendorPaymentConfig } from "@/lib/types";

describe("getProvider", () => {
  const original = process.env.PAYKIT_PROVIDER;

  afterEach(() => {
    if (original === undefined) delete process.env.PAYKIT_PROVIDER;
    else process.env.PAYKIT_PROVIDER = original;
  });

  it("defaults to the direct provider when unset", () => {
    delete process.env.PAYKIT_PROVIDER;
    expect(getProvider()).toBe(directProvider);
  });

  it("selects the direct provider explicitly", () => {
    process.env.PAYKIT_PROVIDER = "direct";
    expect(getProvider()).toBe(directProvider);
  });

  it("falls back to direct and warns on an unrecognized value", () => {
    process.env.PAYKIT_PROVIDER = "not-a-real-provider";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getProvider()).toBe(directProvider);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("not-a-real-provider"),
    );
    warn.mockRestore();
  });
});

describe("directProvider", () => {
  const paynowConfig: VendorPaymentConfig = {
    vendor_id: "11111111-1111-1111-1111-111111111111",
    kind: "paynow",
    uen: "53312345A",
    mobile: null,
    payee_name: "Kopitiam Cart",
    label: null,
    url: null,
    qr_image_url: null,
    verification_method: "manual",
    plan: "free",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("delegates createCheckout to renderCheckout (same behavior as before this seam)", () => {
    const view = directProvider.createCheckout(paynowConfig, {
      amountCents: 450,
      orderRef: "order-1",
    });
    expect(view?.type).toBe("qr");
    expect((view as { payload: string }).payload).toContain("SG.PAYNOW");
  });

  it("getStatus always resolves null — no external state to reconcile", async () => {
    await expect(directProvider.getStatus("tx1")).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/payments/provider.test.ts`
Expected: FAIL — `Cannot find module './provider'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/payments/provider.ts
//
// Payment-provider seam: paykit's own EMVCo/pointer builder (renderCheckout)
// is the default ("direct") provider. Swapping in a real gateway later —
// for genuine tap-to-open-bank-app, see the design spec — is a
// PAYKIT_PROVIDER config change plus one more implementation of
// PaymentProvider, with no changes to callers, CheckoutView, or the
// checkout HTTP contract. See
// docs/superpowers/specs/2026-08-13-paynow-tap-to-pay-design.md (qkit repo).

import { renderCheckout } from "./adapter";
import type { CheckoutView } from "./adapter";
import type { TxStatus, VendorPaymentConfig } from "@/lib/types";

export type ProviderCheckoutStatus = { status: TxStatus } | null;

export interface PaymentProvider {
  name: string;
  createCheckout(
    config: VendorPaymentConfig,
    ctx: { amountCents: number; orderRef: string },
  ): CheckoutView | null;
  getStatus(transactionId: string): Promise<ProviderCheckoutStatus>;
}

export const directProvider: PaymentProvider = {
  name: "direct",
  createCheckout: renderCheckout,
  // paykit's own `transactions` table is authoritative for this provider —
  // there's no external gateway state to reconcile against.
  async getStatus() {
    return null;
  },
};

const PROVIDERS: Record<string, PaymentProvider> = {
  direct: directProvider,
};

/**
 * Selects the active provider from `PAYKIT_PROVIDER`. Unset or
 * unrecognized falls back to `direct` with a warning — never breaks
 * checkout over a bad config value.
 */
export function getProvider(): PaymentProvider {
  const name = process.env.PAYKIT_PROVIDER;
  if (!name) return directProvider;
  const provider = PROVIDERS[name];
  if (!provider) {
    console.warn(`paykit: unknown PAYKIT_PROVIDER "${name}", using "direct"`);
    return directProvider;
  }
  return provider;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/payments/provider.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments/provider.ts src/lib/payments/provider.test.ts
git commit -m "feat: add pluggable payment provider seam behind the direct EMVCo builder"
```

---

### Task 2: Wire the checkout route through `getProvider()`

**Files:**

- Modify: `src/app/api/v1/checkout/route.ts`
- Test: `src/app/api/v1/checkout/route.test.ts` (verify unchanged, no edits expected)

**Interfaces:**

- Consumes: `getProvider()` from Task 1's `@/lib/payments/provider`.

- [ ] **Step 1: Run the existing route tests to confirm the current baseline passes**

Run: `pnpm test src/app/api/v1/checkout/route.test.ts`
Expected: PASS (baseline, before this task's change).

- [ ] **Step 2: Swap the import and call site in `route.ts`**

Change:

```typescript
import { renderCheckout } from "@/lib/payments/adapter";
```

to:

```typescript
import { getProvider } from "@/lib/payments/provider";
```

Change:

```typescript
const view = renderCheckout(config as VendorPaymentConfig, {
  amountCents: amount_cents,
  orderRef: order_ref,
});
```

to:

```typescript
const view = getProvider().createCheckout(config as VendorPaymentConfig, {
  amountCents: amount_cents,
  orderRef: order_ref,
});
```

- [ ] **Step 3: Run the route tests again — must still pass unchanged**

Run: `pnpm test src/app/api/v1/checkout/route.test.ts`
Expected: PASS, same assertions as the pre-change baseline — this task is a
pure call-site swap with `PAYKIT_PROVIDER` unset in the test environment, so
`getProvider()` resolves to `directProvider`, whose `createCheckout` is
`renderCheckout` itself.

- [ ] **Step 4: Full quality gate**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 5: Update `src/lib/payments/README.md`**

Add a new bullet under `## Contents`, after the existing `adapter.ts` bullet:

```markdown
- `provider.ts` — `PaymentProvider` interface, the `direct` provider
  (wraps `renderCheckout`), and `getProvider()` (reads `PAYKIT_PROVIDER`,
  defaults/falls back to `direct`). The seam a future real gateway
  provider plugs into — see the root `AGENTS.md` and
  `docs/superpowers/specs/2026-08-13-paynow-tap-to-pay-design.md` (qkit
  repo) for why.
```

Update the `## Connectivity` section's first sentence from:

```markdown
`renderCheckout` is called by the checkout route/page to build what the
customer sees.
```

to:

```markdown
`renderCheckout` is called through `provider.ts`'s `directProvider` — the
checkout route calls `getProvider().createCheckout(...)`, not
`renderCheckout` directly, so a future non-default provider needs no route
change.
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/checkout/route.ts src/lib/payments/README.md
git commit -m "refactor: route checkout creation through the payment provider seam"
```

---

## Self-Review Notes

- **Spec coverage:** the design spec's Phase 2 asks — `PaymentProvider`
  interface with `createCheckout`/`getStatus`, `direct` as the default
  provider with unchanged behavior, config-gated selection with a
  never-crash fallback — are each covered (Task 1 for the interface/seam,
  Task 2 for wiring the route through it). The gateway shortlist is
  explicitly out of scope per the spec and this plan's Global Constraints.
- **Placeholder scan:** none — every step has real code.
- **Type consistency:** `PaymentProvider.createCheckout` matches
  `renderCheckout`'s existing signature exactly (`(config: VendorPaymentConfig, ctx: {amountCents, orderRef}) => CheckoutView | null`), verified by Task 1's test asserting `directProvider.createCheckout` produces the same `{type: "qr", payload}` shape the pre-existing `adapter.test.ts` already asserts for `renderCheckout`.
