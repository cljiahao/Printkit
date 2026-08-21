# paykit Freemium Nudge Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove paykit's hard 100-transactions/month checkout block on the Free tier; replace it with an unlimited Free tier plus an informational Pro nudge that only appears once a vendor crosses real usage (50 tx/mo), and correct the marketing copy and `AGENTS.md` that currently describe the old cap.

**Architecture:** Delete the count-and-block logic from the checkout API route entirely (it becomes a pure create-transaction endpoint with no volume check). Replace `src/lib/usage.ts`'s cap-oriented exports (`freeTierExceeded`, `usagePercent`) with a single threshold-oriented export (`shouldNudgePro`, `PRO_NUDGE_THRESHOLD`). Update the two dashboard pages that render the usage bar to show a plain count plus a conditional nudge instead. Fix landing-page/FAQ copy and `AGENTS.md`'s data-model description to match.

**Tech Stack:** Next.js 16 App Router (server components), TypeScript strict, Vitest + Testing Library, Zod (unaffected by this change).

## Global Constraints

- No transaction-volume check may block `POST /api/v1/checkout` — Free tier is unlimited at any count.
- The nudge threshold is exactly `50`, matching the number already published in `Merqo Business/docs/business/2026-07-17-vendor-expansion-and-integrations-strategy.md`'s own example.
- Pro price stays `$12/mo` — unchanged, already live in `benefits.tsx`, not a decision this plan makes.
- `pnpm check` (prettier --check + eslint + tsc --noEmit) and `pnpm test` must pass after every task.
- Every file this plan touches is listed in the design spec at `docs/superpowers/specs/2026-07-22-paykit-freemium-nudge-redesign-design.md` — do not edit `docs/superpowers/specs/2026-07-15-paykit-mvp-design.md` or `docs/superpowers/plans/2026-07-15-paykit-mvp.md` (historical records, left as-is per project convention).

---

### Task 1: Replace `usage.ts`'s cap API with a nudge-threshold API

**Files:**

- Modify: `src/lib/usage.ts` (currently exports `freeTierExceeded`, `usagePercent`)
- Test: `src/lib/usage.test.ts` (currently tests both of the above)

**Interfaces:**

- Consumes: `VendorPlan` type from `@/lib/types` (already imported in current `usage.ts`; unchanged).
- Produces: `PRO_NUDGE_THRESHOLD: number` (value `50`) and `shouldNudgePro(plan: VendorPlan, countThisMonth: number): boolean` — Task 2 (checkout route) and Task 3 (dashboard pages) both import `shouldNudgePro`; Task 3 also imports `PRO_NUDGE_THRESHOLD` is not required by Task 3 (it only needs the boolean), but export it anyway since the design spec names it as the documented constant.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/lib/usage.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { shouldNudgePro, PRO_NUDGE_THRESHOLD } from "./usage";

describe("PRO_NUDGE_THRESHOLD", () => {
  it("is 50, matching the published vendor-expansion-strategy example", () => {
    expect(PRO_NUDGE_THRESHOLD).toBe(50);
  });
});

describe("shouldNudgePro", () => {
  it("false for a free vendor under the threshold", () => {
    expect(shouldNudgePro("free", 49)).toBe(false);
  });
  it("true for a free vendor at the threshold", () => {
    expect(shouldNudgePro("free", 50)).toBe(true);
  });
  it("true for a free vendor over the threshold", () => {
    expect(shouldNudgePro("free", 500)).toBe(true);
  });
  it("false for a pro vendor at any count", () => {
    expect(shouldNudgePro("pro", 100_000)).toBe(false);
  });
  it("false for a free vendor at zero", () => {
    expect(shouldNudgePro("free", 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/usage.test.ts`
Expected: FAIL — `shouldNudgePro` and `PRO_NUDGE_THRESHOLD` are not exported by `./usage` (current file only exports `freeTierExceeded`/`usagePercent`).

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/lib/usage.ts` with:

```ts
import type { VendorPlan } from "@/lib/types";

/**
 * Same number named in the vendor-expansion-strategy doc's own nudge
 * example ("50+ manual payment confirms"). Not a cap — Free tier has no
 * cap — just the point a Pro nudge becomes worth showing.
 */
export const PRO_NUDGE_THRESHOLD = 50;

export function shouldNudgePro(
  plan: VendorPlan,
  countThisMonth: number,
): boolean {
  return plan === "free" && countThisMonth >= PRO_NUDGE_THRESHOLD;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/usage.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/usage.ts src/lib/usage.test.ts
git commit -m "feat: replace paykit's tx-cap check with a Pro nudge threshold"
```

---

### Task 2: Remove the hard block from the checkout API route

**Files:**

- Modify: `src/app/api/v1/checkout/route.ts:1-95` (delete the usage-count fetch and `freeTierExceeded` block)
- Test: `src/app/api/v1/checkout/route.test.ts`

**Interfaces:**

- Consumes: nothing new — this task only removes code. `paynowAdapter.renderCheckout` and the `vendor_payment_config`/`transactions` Supabase calls are unchanged from the current file.
- Produces: `POST /api/v1/checkout` now performs exactly 2 Supabase calls (config read, transaction insert) instead of 3 — no consumer outside this file depends on the removed count query.

- [ ] **Step 1: Write the failing test**

In `src/app/api/v1/checkout/route.test.ts`:

1. Remove the `countHead` mock entirely: delete it from the `vi.hoisted(...)` block (lines 4-16) and from `beforeEach` (line 56: `countHead.mockReset().mockResolvedValue({ count: 3, error: null });`).
2. Simplify `fakeSupabase()`'s `"transactions"` branch to drop the now-unused `select`/`gte` chain:

```ts
function fakeSupabase() {
  return {
    from: (table: string) => {
      if (table === "vendor_payment_config") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: configMaybeSingle }) }),
        };
      }
      if (table === "transactions") {
        return {
          insert: () => ({ select: () => ({ single: insertSingle }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}
```

3. Delete the `"402s when a free-tier vendor is at the 100/mo cap"` test (lines 111-121) and the `"503s when the usage count read fails"` test (lines 147-162) entirely.
4. Add a new test proving Free tier has no cap, right after the `"creates a checkout and returns a QR payload"` test:

```ts
it("creates a checkout for a free-tier vendor well past the old 100/mo cap", async () => {
  configMaybeSingle.mockResolvedValue({
    data: {
      vendor_id: "11111111-1111-1111-1111-111111111111",
      uen: "53312345A",
      mobile: null,
      payee_name: "Kopitiam Cart",
      verification_method: "manual",
      plan: "free",
    },
    error: null,
  });
  const res = await POST(
    req({
      vendor_id: "11111111-1111-1111-1111-111111111111",
      amount_cents: 450,
      order_ref: "A-501",
    }),
  );
  expect(res.status).toBe(200);
});
```

(Note: this test doesn't need to mock a count at all, since the route will no longer read one — that's the point of the test. `configMaybeSingle`'s value here is the same shape already set in `beforeEach`; the explicit re-mock is just to make the "free tier, past 100" intent readable at the call site. It is safe to instead skip the explicit re-mock and rely on `beforeEach`'s default `plan: "free"` — either is correct; the explicit version above is preferred for clarity.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/api/v1/checkout/route.test.ts`
Expected: FAIL — the deleted `countHead` mock is still referenced by the still-unmodified `route.ts`, which will throw or return an unexpected shape from the count query (since `fakeSupabase()` no longer provides `select().eq().gte()` on the `"transactions"` table).

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/app/api/v1/checkout/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyKitAuth } from "@/lib/kit-auth";
import { checkoutRequestSchema } from "@/lib/api-schemas";
import { paynowAdapter } from "@/lib/payments/adapter";
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

  const view = paynowAdapter.renderCheckout(config as VendorPaymentConfig, {
    amountCents: amount_cents,
    orderRef: order_ref,
  });

  const { data: inserted, error: insertError } = await supabase
    .from("transactions")
    .insert({
      vendor_id,
      kit_slug: auth.kitSlug,
      order_ref,
      amount_cents,
      qr_payload: view.payload,
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

  return NextResponse.json({
    transaction_id: inserted.id,
    qr_payload: inserted.qr_payload,
  });
}
```

(This removes the `freeTierExceeded` import, the `startOfMonth`/`count`/`countError` block, and the `402` response — everything else is byte-for-byte identical to the current file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/api/v1/checkout/route.test.ts`
Expected: PASS (7 tests: create+200, 401, 422, 400, 503-config, 503-insert, 200-past-old-cap).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/checkout/route.ts src/app/api/v1/checkout/route.test.ts
git commit -m "fix: remove paykit's hard 100 tx/mo checkout block"
```

---

### Task 3: Update the dashboard usage displays to a plain count + threshold nudge

**Files:**

- Modify: `src/app/dashboard/page.tsx:1-46`
- Modify: `src/app/dashboard/plan/page.tsx:1-73`

**Interfaces:**

- Consumes: `shouldNudgePro` from `@/lib/usage` (Task 1). `txCountThisMonth` from `@/lib/transactions` and `getVendorPlan`/`getVendorSession` from `@/lib/vendor-session` — both unchanged, already imported in both files today.
- Produces: nothing consumed by later tasks — this is a leaf UI change.

There are no existing dom tests covering either page's usage bar (confirmed: only `src/lib/usage.test.ts` references `usagePercent`/`freeTierExceeded` anywhere in the test suite), so this task has no test file to update — it's a direct UI edit, verified by `pnpm check` (typecheck catches any leftover `usagePercent` import) and manual reasoning about the two diffs below.

- [ ] **Step 1: Update `src/app/dashboard/page.tsx`**

Replace the full contents with:

```tsx
import Link from "next/link";
import { getVendorSession, getVendorPlan } from "@/lib/vendor-session";
import { txCountThisMonth } from "@/lib/transactions";
import { shouldNudgePro } from "@/lib/usage";

export default async function DashboardPage() {
  const { supabase, user } = await getVendorSession();

  const config = await getVendorPlan(supabase, user.id);
  const count = await txCountThisMonth(user.id);
  const plan = config?.plan ?? "free";

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      {!config && (
        <p className="rounded-xl border bg-secondary/50 p-4 text-sm">
          You haven&apos;t set up PayNow yet.{" "}
          <Link
            href="/dashboard/config"
            className="underline underline-offset-4"
          >
            Set it up
          </Link>
          .
        </p>
      )}

      <div className="rounded-xl border p-4">
        <p className="text-sm font-medium">
          {count} transaction{count === 1 ? "" : "s"} this month
        </p>
        {shouldNudgePro(plan, count) && (
          <p className="mt-2 text-sm text-muted-foreground">
            You&apos;re doing real volume —{" "}
            <Link
              href="/dashboard/plan"
              className="underline underline-offset-4"
            >
              Pro
            </Link>{" "}
            adds reports and refund tracking, $12/mo.
          </p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Update `src/app/dashboard/plan/page.tsx`**

Replace the full contents with:

```tsx
import Link from "next/link";
import { getVendorSession, getVendorPlan } from "@/lib/vendor-session";
import { txCountThisMonth } from "@/lib/transactions";
import { shouldNudgePro } from "@/lib/usage";

export const revalidate = 0;

export default async function PlanPage() {
  const { supabase, user } = await getVendorSession();
  const config = await getVendorPlan(supabase, user.id);
  const plan = config?.plan ?? "free";
  const count = await txCountThisMonth(user.id);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← Dashboard
        </Link>
      </div>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Your account
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>
      </header>

      <div className="rounded-xl border p-4">
        <p className="text-sm font-medium">
          Current plan: <span className="capitalize">{plan}</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {count} transaction{count === 1 ? "" : "s"} this month
        </p>
        {shouldNudgePro(plan, count) && (
          <p className="mt-2 text-sm text-muted-foreground">
            You&apos;re doing real volume — Pro adds reports and refund
            tracking, $12/mo.
          </p>
        )}
      </div>

      <div className="rounded-xl border p-4">
        <p className="text-sm font-medium">{plan === "pro" ? "Pro" : "Free"}</p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>Unlimited PayNow transactions</li>
          {plan === "pro" && (
            <>
              <li>Reports</li>
              <li>Refunds</li>
            </>
          )}
        </ul>
        {plan === "free" && (
          <p className="mt-3 text-sm text-muted-foreground">
            Ask us to upgrade your account to Pro for reports and refunds.
          </p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck to confirm no leftover references**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (confirms neither file still imports the deleted `usagePercent`).

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test`
Expected: all existing tests still pass — no test file covers these two pages' markup today, so this step is a regression check, not a new-coverage check.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/dashboard/plan/page.tsx
git commit -m "fix: replace paykit's dashboard usage cap bar with a plain count + nudge"
```

---

### Task 4: Fix marketing copy and `AGENTS.md`

**Files:**

- Modify: `src/components/landing/benefits.tsx:57-59`
- Modify: `src/components/landing/faq.tsx:18`
- Modify: `AGENTS.md:70` (governance file — `Edit` on this path prompts for permission per `.claude/settings.json`; approve when asked, this is an expected, intentional edit)

**Interfaces:**

- Consumes: nothing (copy-only changes).
- Produces: nothing consumed elsewhere — leaf documentation/marketing task.

- [ ] **Step 1: Update `src/components/landing/benefits.tsx`**

Find this block (around line 53-60):

```tsx
              <h3 className="font-display text-lg font-bold">
                Free while you&apos;re small
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                100 transactions a month, no card required. Pro removes the cap
                and adds revenue reports and refund tracking — $12/mo, once
                you&apos;re past it.
              </p>
```

Replace with:

```tsx
              <h3 className="font-display text-lg font-bold">
                Free while you&apos;re small
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Unlimited PayNow transactions, no card required. Pro adds
                revenue reports and refund tracking — $12/mo, once
                you&apos;re doing enough volume to want them.
              </p>
```

- [ ] **Step 2: Update `src/components/landing/faq.tsx`**

Find this line (line 18):

```ts
    a: "Up to 100 transactions a month. Pro removes that cap and adds reports and refunds.",
```

Replace with:

```ts
    a: "Unlimited transactions on the free plan, no cap. Pro adds revenue reports and refund tracking.",
```

- [ ] **Step 3: Update `AGENTS.md`**

Find this block (around line 68-74):

```md
- `vendor_payment_config` (PK `vendor_id`): one PayNow config per vendor,
  reused across every kit/booth/store that vendor runs. Exactly one of
  `uen`/`mobile`. `plan` (`free`|`pro`) gates the 100 tx/mo cap and Pro
  features (reports, refunds) — this column is a minimal addition beyond the
  design spec's literal table listing, necessary to implement the very
  Pro-gate the same spec describes (see the plan's Self-Review).
  `verification_method` is schema-reserved (`'manual'` only is ever written).
```

Replace with:

```md
- `vendor_payment_config` (PK `vendor_id`): one PayNow config per vendor,
  reused across every kit/booth/store that vendor runs. Exactly one of
  `uen`/`mobile`. `plan` (`free`|`pro`) gates Pro-exclusive features
  (reports, refunds) only — no transaction-volume cap; Free tier PayNow
  checkout is unlimited (see `docs/superpowers/specs/2026-07-22-paykit-
freemium-nudge-redesign-design.md`). This column is a minimal addition
  beyond the design spec's literal table listing, necessary to implement
  the very Pro-gate the same spec describes (see the plan's Self-Review).
  `verification_method` is schema-reserved (`'manual'` only is ever written).
```

- [ ] **Step 4: Run the full verification suite**

Run: `pnpm check && pnpm test`
Expected: both pass clean — this confirms the copy edits didn't break formatting/lint and no test asserts the old copy strings.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/benefits.tsx src/components/landing/faq.tsx AGENTS.md
git commit -m "docs: correct paykit marketing copy and AGENTS.md — no tx-volume cap"
```

---

### Task 5: Final full-suite verification and push

**Files:** none (verification-only task).

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check`
Expected: prettier, eslint, and tsc all pass with no errors.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass (net test count: same as before minus the 2 deleted checkout-route tests, plus 1 new checkout-route test, plus `usage.test.ts`'s test count changing from 8 to 6 — no net regression, every deletion is matched by an equivalent-or-stronger replacement per Tasks 1-2).

- [ ] **Step 3: Confirm no other file still references the deleted exports**

Run: `grep -rn "freeTierExceeded\|usagePercent" src test`
Expected: no output (confirms full removal across the codebase).

- [ ] **Step 4: Push**

```bash
git push origin main
```

Expected: push succeeds, harness pre-push hooks (harness-integrity, full verify) pass — same as every prior push in this repo.
