# paykit Admin-Tunable Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace paykit's hardcoded `PRO_PRICE` constant
(`src/lib/plan-view.ts`) with a live, admin-editable price — a single-row
`paykit.pricing` table, a `setPricing` Server Action, and `@merqo/ui`'s new
`PricingForm` wired into `/admin` — seeded at **$4.99/mo** (up from $4/mo,
a charm-pricing correction; see the rationale doc cited in the spec). Every
vendor-facing/marketing call site that quotes the price switches from a
literal string to a live DB read.

**Architecture:** One new table, one new lib module (`src/lib/pricing.ts`,
a single `getPricing(supabase)` read + `DEFAULT_PRICING` fallback shared by
every consumer), one new Server Action, one new client wrapper component
around the shared `@merqo/ui` `PricingForm`. `resolvePlanView` gains a
`monthlyCents` parameter and a `proPriceLabel` output field instead of
every page importing a raw cents value and formatting it separately.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Zod, Supabase
(`@supabase/ssr`), Vitest + Testing Library (jsdom), Tailwind v4,
`@merqo/ui`.

**Spec:** `docs/superpowers/specs/2026-08-15-paykit-admin-pricing-design.md`

## Global Constraints

- **Blocking cross-repo dependency:** `@merqo/ui` must be tagged at a
  version that exports `PricingForm` (its own plan targets `v0.12.0`;
  confirm the actual tag — `git ls-remote --tags` against
  `github:cljiahao/merqo-ui`, or check that repo's `package.json` — since
  `package.json` version fields have been observed out of sync with real
  tags before). Do not start Task 5 (admin wiring) until this is
  confirmed.
- **Shared-file sequencing:** `src/lib/plan-view.ts` is also targeted by
  the approved-but-unshipped
  `docs/superpowers/plans/2026-08-15-paykit-pro-simplification.md`. Check
  `git log -1 -- src/lib/plan-view.ts` / read the file's current content
  before starting Task 4 below — if `pro-simplification` has already
  landed, this plan's diff is exactly as written; if it hasn't, this
  plan's diff still applies cleanly (it only touches `PRO_PRICE` and the
  function signature, not the `features` list), but branch off `main`
  fresh rather than off a stale local branch to avoid a silent merge
  conflict later.
- This plan does **not** touch `resolvePlanView`'s `features` list, the
  stats-page plan gate, or any other scope owned by `pro-simplification`.
- `VendorPlan` stays exactly `"free" | "pro"` — no schema change to that
  type.
- TypeScript strict — no `any`, no `@ts-ignore` (AGENTS.md).
- Validate all admin input with Zod (AGENTS.md).
- Service-role client only in Server Actions, never client components
  (AGENTS.md).
- Work on a feature branch, never commit directly to `main`.
- Commit messages follow Conventional Commits.
- Run `pnpm check && pnpm test` before considering any task done; run
  `pnpm build` before opening the PR (Task 12 is the full gate — Next.js
  client/server bundle-boundary errors don't show up in `check`/`test`).

---

### Task 0: Branch setup + dependency check

**Files:** none

- [ ] **Step 1: Confirm the `@merqo/ui` PricingForm tag exists**

```bash
git ls-remote --tags https://github.com/cljiahao/merqo-ui.git
```

Confirm a tag ≥ the one that shipped `PricingForm` (check that repo's
`docs/superpowers/plans/2026-08-15-pricing-form.md` Task 2 for the exact
target version if unsure). If it doesn't exist yet, stop here and wait —
do not start this plan's later tasks against an unpublished dependency.

- [ ] **Step 2: Check `plan-view.ts`'s current state**

```bash
git log -1 --oneline -- src/lib/plan-view.ts
```

Read `src/lib/plan-view.ts` directly. Note whether `pro-simplification`
has already landed (features list already refunds-only, `PRO_PRICE` reads
`"$4/mo"`) or not (`PRO_PRICE` still `"$12/mo"`, stats still Pro-gated).
Either starting state is fine — Task 4 below states both diffs.

- [ ] **Step 3: Create and switch to a feature branch off `main`**

```bash
git fetch origin main
git checkout -b feat/admin-pricing origin/main
```

- [ ] **Step 4: Confirm baseline tests pass**

Run: `pnpm test`
Expected: all existing tests PASS.

---

### Task 1: Migration — `paykit.pricing`

**Files:**

- Create: `supabase/migrations/0008_paykit_pricing.sql`
- Modify: `src/lib/types.ts`

**Interfaces:**

- Produces: `paykit.pricing` table (`id`, `monthly_cents`, `currency`,
  `updated_at`), consumed by `getPricing`/`setPricing` and
  `Database["paykit"]["Tables"]["pricing"]`.

- [ ] **Step 1: Write the migration**

```sql
-- 0008 — admin-editable pricing: a single-row config so the plan page,
-- dashboard nudge, and landing copy can show a live Pro price and an admin
-- can tune it without a deploy. Mirrors qkit's own qkit.pricing table
-- (qkit's supabase/migrations/0010_monetization.sql), narrowed to paykit's
-- one price — no day-pass concept here, that stays qkit-only per the
-- cross-kit pricing doc's own decision. id is pinned to 1.

create table paykit.pricing (
  id            int primary key default 1 check (id = 1),
  monthly_cents int not null default 0,
  currency      text not null default 'SGD',
  updated_at    timestamptz not null default now()
);

insert into paykit.pricing (id, monthly_cents)
  values (1, 499)
  on conflict (id) do nothing;

alter table paykit.pricing enable row level security;

-- Price isn't secret — shown on the anonymous landing page, not just
-- behind auth. Writes go through the service-role admin action only (no
-- write policy, matching qkit's pricing_public_select precedent).
create policy pricing_public_select on paykit.pricing
  for select using (true);

-- Data-API grants (be explicit).
grant select on paykit.pricing to anon, authenticated;
grant all on paykit.pricing to service_role;
```

- [ ] **Step 2: Update `src/lib/types.ts`**

Add a `Pricing` type and a matching `Database["paykit"]["Tables"]["pricing"]`
entry, following this file's existing style (see `admin_audit`'s entry for
the shape to match):

```ts
export type Pricing = {
  id: number;
  monthly_cents: number;
  currency: string;
  updated_at: string;
};
```

```ts
      pricing: {
        Row: Pricing;
        Insert: {
          id?: number;
          monthly_cents?: number;
          currency?: string;
          updated_at?: string;
        };
        Update: {
          monthly_cents?: number;
          currency?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
```

(Insert into `Database["paykit"]["Tables"]` alongside the other table
entries, before the closing brace.)

- [ ] **Step 3: Apply the migration locally**

Run: `/supabase-migrate` (project skill — applies `supabase/migrations` +
regenerates types; use it as the safety gate instead of running
`supabase db push`/`gen types` by hand).
Expected: migration applies cleanly, no drift between the hand-written
`types.ts` edit above and the regenerated output (reconcile if any).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0008_paykit_pricing.sql src/lib/types.ts
git commit -m "feat: add paykit.pricing table for admin-tunable pricing"
```

---

### Task 2: `src/lib/pricing.ts`

**Files:**

- Create: `src/lib/pricing.ts`

**Interfaces:**

- Produces: `PricingConfig`, `DEFAULT_PRICING`, `getPricing(supabase)` —
  consumed by `admin-data.ts`, `admin/page.tsx` (via that),
  `dashboard/page.tsx`, `dashboard/plan/page.tsx`, `app/page.tsx`.

- [ ] **Step 1: Write the module**

No dedicated unit test file — this mirrors qkit's own `src/lib/pricing.ts`
(a plain type + constant + one straight-through Supabase read, no
branching logic to unit-test in isolation; its behavior is covered by the
dom tests of every page that calls it, Tasks 5-8 below).

```ts
import type { createServerClient } from "@/lib/supabase/server";

export interface PricingConfig {
  monthly_cents: number;
  currency: string;
}

/**
 * Fallback when the `pricing` row can't be read (e.g. pre-migration).
 * Zeroed so every consuming page still renders instead of throwing —
 * mirrors qkit's own DEFAULT_PRICING fallback.
 */
export const DEFAULT_PRICING: PricingConfig = {
  monthly_cents: 0,
  currency: "SGD",
};

/**
 * Reads the single pricing row (id = 1). Accepts either the cookie client
 * (dashboard/landing reads — the row is public-read, pricing_public_select)
 * or the service-role client (the admin read, via admin-data.ts) — both
 * are structurally the same generated client type, just different auth.
 */
export async function getPricing(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
): Promise<PricingConfig> {
  const { data } = await supabase
    .from("pricing")
    .select("monthly_cents, currency")
    .eq("id", 1)
    .maybeSingle();
  return data ?? DEFAULT_PRICING;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm check`
Expected: PASS — in particular, confirm `createServiceClient()`'s return
type is assignable where `getPricing` is later called with it (Task 3);
if TypeScript rejects the structural match, widen the parameter type to a
shared `SupabaseClient<Database, "paykit">` alias instead — either is
acceptable, whichever the real compiler accepts.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pricing.ts
git commit -m "feat: add getPricing/DEFAULT_PRICING shared pricing reader"
```

---

### Task 3: `setPricing` Server Action

**Files:**

- Modify: `src/app/admin/actions.ts`
- Modify: `src/app/admin/actions.test.ts`

**Interfaces:**

- Consumes: `requireAdmin`, `createServiceClient`, the existing
  `recordAudit` helper already in this file.
- Produces: `setPricing(input: { monthly_cents: number }): Promise<ActionResult>`
  — consumed by `pricing-section.tsx` (Task 5).

- [ ] **Step 1: Write the failing tests first**

In `actions.test.ts`, add a `describe("setPricing", ...)` block mirroring
the existing `setVendorPlan` suite's shape and mock setup (reuse the same
`vi.hoisted` mocks — `requireAdminMock`, `createServiceClientMock` — add a
`pricingUpdateMock` alongside the existing `updateMock`/`insertMock`, or
branch the existing `createServiceClientMock`'s `from()` on `table ===
"pricing"`):

```ts
describe("setPricing", () => {
  it("404s (via requireAdmin) before writing anything for a non-admin", async () => {
    requireAdminMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    const { setPricing } = await import("./actions");
    await expect(setPricing({ monthly_cents: 499 })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("rejects a negative or oversized amount without writing", async () => {
    const { setPricing } = await import("./actions");
    expect(await setPricing({ monthly_cents: -1 })).toEqual({
      success: false,
      error: "Invalid input",
    });
    expect(await setPricing({ monthly_cents: 999_999 })).toEqual({
      success: false,
      error: "Invalid input",
    });
  });

  it("updates the pricing row, records an audit row, and revalidates on success", async () => {
    const { setPricing } = await import("./actions");
    const result = await setPricing({ monthly_cents: 499 });
    expect(result).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ monthly_cents: 499 }),
    );
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: "admin-1",
        action: "set_pricing",
        detail: { monthly_cents: 499 },
      }),
    );
  });

  it("returns an error when the update fails", async () => {
    updateMock.mockReturnValue({
      eq: () => Promise.resolve({ error: { message: "db down" } }),
    });
    const { setPricing } = await import("./actions");
    expect(await setPricing({ monthly_cents: 499 })).toEqual({
      success: false,
      error: "Could not update pricing",
    });
  });
});
```

Adjust the shared `createServiceClientMock`'s `from()` branch (and
`updateMock`'s chain shape — this write is `.update(...).eq("id", 1)`
with no `.select()`, unlike `setVendorPlan`'s) to match what Step 3 below
actually calls.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/app/admin/actions.test.ts`
Expected: FAIL — `setPricing` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

In `src/app/admin/actions.ts`, add near the other schemas/actions:

```ts
// No monthly SaaS price in this kit should plausibly exceed this — a local
// sanity bound (paykit has no shared MAX_MONEY_CENTS constant, unlike qkit).
const PRICE_CENTS_MAX = 100_000; // $1,000

const setPricingSchema = z.object({
  monthly_cents: z.number().int().nonnegative().max(PRICE_CENTS_MAX),
});

/**
 * Update the single pricing row (id = 1) shown on the plan page, dashboard
 * nudge, and landing copy. Admin-only: requireAdmin() 404s non-admins
 * before any write. Service-role client — pricing has no write policy at
 * all (see 0008_paykit_pricing.sql), so only this path can ever change it.
 */
export async function setPricing(
  input: z.infer<typeof setPricingSchema>,
): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = setPricingSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("pricing")
    .update({
      monthly_cents: parsed.data.monthly_cents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) {
    console.error("setPricing failed", error.message);
    return { success: false, error: "Could not update pricing" };
  }

  await recordAudit(user.id, "set_pricing", null, {
    monthly_cents: parsed.data.monthly_cents,
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/plan");
  revalidatePath("/");
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/app/admin/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/actions.ts src/app/admin/actions.test.ts
git commit -m "feat: add setPricing admin action"
```

---

### Task 4: `resolvePlanView` — live price instead of `PRO_PRICE`

**Files:**

- Modify: `src/lib/plan-view.ts`
- Modify: `src/lib/plan-view.test.ts`

**Interfaces:**

- Produces: `resolvePlanView(plan, countThisMonth, monthlyCents)` →
  `PlanView` now including `proPriceLabel: string`; `PRO_PRICE` no longer
  exported.

- [ ] **Step 1: Update the failing tests first**

Delete the `describe("PRO_PRICE", ...)` block entirely. Add a
`monthlyCents` argument (use `499` throughout) to every existing
`resolvePlanView(...)` call, and add:

```ts
it("formats the live monthly price for display", () => {
  expect(resolvePlanView("free", 0, 499).proPriceLabel).toBe("$4.99/mo");
  expect(resolvePlanView("free", 0, 1200).proPriceLabel).toBe("$12.00/mo");
});
```

(Keep whatever `features` assertions are already in this file as-is —
`pro-simplification`'s scope, not this task's; if that plan has already
landed, the existing assertions already reflect its shape and don't need
touching here.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/plan-view.test.ts`
Expected: FAIL — `resolvePlanView` doesn't take a third argument yet, and
`PRO_PRICE` is still exported/imported by the deleted describe block.

- [ ] **Step 3: Write the implementation**

```ts
import type { VendorPlan } from "@/lib/types";
import { shouldNudgePro } from "@/lib/usage";
import { formatCents } from "@/lib/utils";

export interface PlanView {
  plan: VendorPlan;
  planLabel: "Free" | "Pro";
  countLabel: string;
  showNudge: boolean;
  features: string[];
  showUpgrade: boolean;
  /** Live Pro price, formatted for display (e.g. "$4.99/mo"). */
  proPriceLabel: string;
}

/**
 * Pure view-model for the Plan page (and the dashboard nudge): the
 * free/pro feature list, the transaction-count copy, the Pro-nudge
 * visibility, whether to show the upgrade CTA, and the live Pro price
 * formatted for display. `monthlyCents` comes from the admin-tunable
 * `pricing` table (src/lib/pricing.ts), not a hardcoded constant.
 */
export function resolvePlanView(
  plan: VendorPlan,
  countThisMonth: number,
  monthlyCents: number,
): PlanView {
  const isPro = plan === "pro";
  return {
    plan,
    planLabel: isPro ? "Pro" : "Free",
    countLabel: `${countThisMonth} transaction${countThisMonth === 1 ? "" : "s"} this month`,
    showNudge: shouldNudgePro(plan, countThisMonth),
    features: isPro
      ? ["Unlimited transactions", "Stats", "Refunds"]
      : ["Unlimited transactions"],
    showUpgrade: !isPro,
    proPriceLabel: `${formatCents(monthlyCents)}/mo`,
  };
}
```

Leave the `features` branch exactly as it already reads in the working
tree (copy the block above only for `PRO_PRICE`'s removal and
`proPriceLabel`'s addition — do not revert `pro-simplification`'s
`features` change if it's already landed; do not pre-emptively apply it if
it hasn't, per Global Constraints).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/plan-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-view.ts src/lib/plan-view.test.ts
git commit -m "feat: replace PRO_PRICE constant with a live-priced proPriceLabel"
```

---

### Task 5: Admin page wiring — `PricingSection` + `/admin`

**Files:**

- Create: `src/app/admin/pricing-section.tsx`
- Create: `src/app/admin/pricing-section.dom.test.tsx`
- Modify: `src/lib/admin-data.ts`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/admin-overview-page.dom.test.tsx`
- Modify: `package.json` (bump `@merqo/ui`)

**Interfaces:**

- Consumes: `@merqo/ui`'s `PricingForm` (confirmed available per Task 0),
  `setPricing` (Task 3), `getPricing` (Task 2).
- Produces: `PricingSection`, `getAdminPricing()`.

- [ ] **Step 1: Bump the `@merqo/ui` dependency**

In `package.json`, update:

```json
"@merqo/ui": "github:cljiahao/merqo-ui#v0.12.0",
```

(Use the actual confirmed tag from Task 0, Step 1 — `v0.12.0` is the
target named in that plan, but verify before pinning it literally.)

```bash
pnpm install
```

Expected: lockfile updates cleanly, `PricingForm` is importable from
`@merqo/ui`.

- [ ] **Step 2: Write the failing tests first**

`src/app/admin/pricing-section.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { toast } from "sonner";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const setPricingMock = vi.fn();
vi.mock("./actions", () => ({ setPricing: setPricingMock }));

import { PricingSection } from "./pricing-section";

beforeEach(() => {
  setPricingMock.mockReset();
});

describe("PricingSection", () => {
  it("submits the edited price as cents and toasts success", async () => {
    setPricingMock.mockResolvedValue({ success: true });
    render(
      <PricingSection initial={{ monthly_cents: 499, currency: "SGD" }} />,
    );
    fireEvent.change(screen.getByLabelText(/monthly/i), {
      target: { value: "5.99" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(setPricingMock).toHaveBeenCalledWith({ monthly_cents: 599 }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("toasts an error when the action returns failure", async () => {
    setPricingMock.mockResolvedValue({
      success: false,
      error: "Could not update pricing",
    });
    render(
      <PricingSection initial={{ monthly_cents: 499, currency: "SGD" }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not update pricing"),
    );
  });
});
```

In `admin-overview-page.dom.test.tsx`, add `getAdminPricing: vi.fn(async () => ({
monthly_cents: 499, currency: "SGD" }))` to the existing `@/lib/admin-data`
mock, and an assertion that the Pricing section renders (e.g.
`expect(screen.getByText(/pricing/i)).toBeInTheDocument()`).

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test src/app/admin/pricing-section.dom.test.tsx src/app/admin/admin-overview-page.dom.test.tsx`
Expected: FAIL — `pricing-section.tsx` doesn't exist yet; `admin/page.tsx`
doesn't render a Pricing section yet.

- [ ] **Step 4: Write the implementation**

`src/lib/admin-data.ts` — add, alongside the existing exports:

```ts
import { getPricing, type PricingConfig } from "@/lib/pricing";

/** The single pricing row, read with the service-role client (admin console). */
export async function getAdminPricing(): Promise<PricingConfig> {
  const supabase = await createServiceClient();
  return getPricing(supabase);
}
```

`src/app/admin/pricing-section.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PricingForm } from "@merqo/ui";
import { setPricing } from "./actions";
import type { PricingConfig } from "@/lib/pricing";

/**
 * Wires @merqo/ui's generic PricingForm to paykit's one field
 * (monthly_cents) and this kit's own setPricing action + toast
 * convention. The component itself never imports sonner or touches
 * Supabase — onSave resolving/rejecting is the only contract.
 */
export function PricingSection({ initial }: { initial: PricingConfig }) {
  const router = useRouter();

  return (
    <PricingForm
      fields={[
        { key: "monthly_cents", label: `Monthly (${initial.currency})` },
      ]}
      initial={{
        values: { monthly_cents: initial.monthly_cents },
        currency: initial.currency,
      }}
      onSave={async (values) => {
        const res = await setPricing({ monthly_cents: values.monthly_cents });
        if (!res.success) throw new Error(res.error);
        toast.success("Pricing updated");
        router.refresh();
      }}
      onError={(err) =>
        toast.error(
          err instanceof Error ? err.message : "Could not update pricing",
        )
      }
      helpText="Shown on the vendor plan page, dashboard nudge, and landing site."
    />
  );
}
```

`src/app/admin/page.tsx` — extend the existing import from `@/lib/admin-data`
with `getAdminPricing`, add `import { PricingSection } from "./pricing-section";`,
extend the `Promise.all`:

```tsx
const [totals, activity, pricing] = await Promise.all([
  platformTotals(),
  recentActivity(15),
  getAdminPricing(),
]);
```

and add a new section (placed after the existing "Recent activity" section,
matching the existing section-header pattern):

```tsx
<section className="space-y-3">
  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
    Pricing
  </h2>
  <PricingSection initial={pricing} />
</section>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/app/admin/pricing-section.dom.test.tsx src/app/admin/admin-overview-page.dom.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/admin-data.ts src/app/admin/pricing-section.tsx src/app/admin/pricing-section.dom.test.tsx src/app/admin/page.tsx src/app/admin/admin-overview-page.dom.test.tsx
git commit -m "feat: wire @merqo/ui PricingForm into /admin"
```

---

### Task 6: `dashboard/plan/page.tsx` — live DB read

**Files:**

- Modify: `src/app/dashboard/plan/page.tsx`
- Modify: `src/app/dashboard/plan/page.dom.test.tsx`

**Interfaces:**

- Consumes: `getPricing` (Task 2), `resolvePlanView`'s new signature
  (Task 4).

- [ ] **Step 1: Update the failing tests first**

Add a pricing-row mock/stub to whatever Supabase mock this test file
already builds for `getVendorSession`'s client (or mock `@/lib/pricing`'s
`getPricing` directly, whichever this file's existing mocking style
favors — check the file before choosing). Update the nudge/upgrade-copy
assertions to expect `"$4.99/mo"` (or `formatCents(499) + "/mo"`, matching
however the existing assertions are phrased) instead of any literal
`PRO_PRICE` string.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/app/dashboard/plan/page.dom.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```tsx
import { getVendorSession, getVendorPlan } from "@/lib/vendor-session";
import { txCountThisMonth } from "@/lib/transactions";
import { resolvePlanView } from "@/lib/plan-view";
import { getPricing } from "@/lib/pricing";
import { BackButton } from "@/components/back-button";
import { UpgradeCta } from "./upgrade-cta";

export const revalidate = 0;

export default async function PlanPage() {
  const { supabase, user } = await getVendorSession();
  const [config, count, pricing] = await Promise.all([
    getVendorPlan(supabase, user.id),
    txCountThisMonth(user.id),
    getPricing(supabase),
  ]);
  const plan = config?.plan ?? "free";
  const view = resolvePlanView(plan, count, pricing.monthly_cents);

  // ...unchanged JSX below, except:
  // - remove `import { ..., PRO_PRICE } from "@/lib/plan-view"`; PRO_PRICE no longer exists
  // - `{PRO_PRICE}` → `{view.proPriceLabel}` in both the nudge paragraph
  //   and the upgrade-CTA paragraph
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/app/dashboard/plan/page.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/plan/page.tsx src/app/dashboard/plan/page.dom.test.tsx
git commit -m "feat: read the live Pro price on the plan page"
```

---

### Task 7: `dashboard/page.tsx` — live DB read for the inline nudge

**Files:**

- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard/page.dom.test.tsx`

**Interfaces:**

- Consumes: `getPricing` (Task 2), `formatCents` (existing,
  `src/lib/utils.ts`).

- [ ] **Step 1: Update the failing tests first**

Add a pricing mock/stub (same approach as Task 6, Step 1) and update the
nudge-copy assertion to expect `"$4.99/mo"` instead of the current literal
`"$12/mo"` (or whatever `pro-simplification` has left there).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/app/dashboard/page.dom.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Add `getPricing` to the page's existing `Promise.all` and `formatCents`
import:

```tsx
import { getPricing } from "@/lib/pricing";
import { formatCents } from "@/lib/utils";
// ...
const [config, count, { data: prefs }, pricing] = await Promise.all([
  getConfig(),
  txCountThisMonth(user.id),
  supabase
    .from("vendor_prefs")
    .select("tour_seen_at")
    .eq("vendor_id", user.id)
    .maybeSingle(),
  getPricing(supabase),
]);
```

Replace the nudge paragraph's literal price with
``{`${formatCents(pricing.monthly_cents)}/mo`}``, and (if
`pro-simplification` hasn't landed yet) leave "adds stats and refund
tracking" as-is — this task only touches the price, not that copy's
feature list, per Global Constraints.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/app/dashboard/page.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/dashboard/page.dom.test.tsx
git commit -m "feat: read the live Pro price on the dashboard nudge"
```

---

### Task 8: Landing copy — `page.tsx`, `benefits.tsx`, `faq.tsx`

**Files:**

- Modify: `src/app/page.tsx`
- Modify: `src/components/landing/benefits.tsx`
- Modify: `src/components/landing/faq.tsx`
- Modify: any landing component test asserting the old copy strings
  (search first: `grep -rln "4/mo\|12/mo" src/components/landing/ src/app/page.tsx` —
  or the equivalent `Grep` tool call)

**Interfaces:**

- Consumes: `getPricing` (Task 2), `formatCents`.
- Produces: `Benefits`/`Faq` now take `{ monthlyPriceLabel: string }`.

- [ ] **Step 1: Update the failing tests first**

Update any matched test's assertions to the new copy string, and pass a
`monthlyPriceLabel="$4.99/mo"` prop to `<Benefits>`/`<Faq>` wherever those
tests render them directly (not through `HomePage`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test` (landing tests, scoped by the grep from this task's Files
list)
Expected: FAIL (or no-op if no such tests exist yet — confirm via the
grep before assuming).

- [ ] **Step 3: Write the implementation**

`src/app/page.tsx`:

```tsx
import { getPricing } from "@/lib/pricing";
import { formatCents } from "@/lib/utils";
// ...
export default async function HomePage() {
  const supabase = await createServerClient();
  const [
    {
      data: { user },
    },
    pricing,
  ] = await Promise.all([supabase.auth.getUser(), getPricing(supabase)]);
  const authed = !!user;
  const monthlyPriceLabel = `${formatCents(pricing.monthly_cents)}/mo`;

  return (
    <>
      <Nav authed={authed} />
      <main>
        <Hero authed={authed} />
        <HowItWorks />
        <Benefits monthlyPriceLabel={monthlyPriceLabel} />
        <Faq monthlyPriceLabel={monthlyPriceLabel} />
      </main>
      <ClosingCta authed={authed} />
      <Footer />
      <BackToTop />
    </>
  );
}
```

`src/components/landing/benefits.tsx` — change the signature and the
"Free while you're small" tile's paragraph:

```tsx
export function Benefits({ monthlyPriceLabel }: { monthlyPriceLabel: string }) {
  // ...
  <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
    Unlimited transactions, no card required. Pro adds refund tracking —{" "}
    {monthlyPriceLabel}, once you&apos;re doing enough volume to want it.
  </p>;
  // ...
}
```

(Adjust the exact surrounding sentence to whatever `pro-simplification`
has already left in place — this task only replaces the literal price
fragment with the prop, not the rest of the sentence's wording, unless
that sentence still says "$4/mo"/"$12/mo" verbatim, in which case replace
that substring only.)

`src/components/landing/faq.tsx` — move the `FAQ` array from module scope
into the component body so it can close over the prop:

```tsx
type FaqEntry = { q: string; a: string };

function FaqItem({ q, a }: FaqEntry) {
  // unchanged
}

export function Faq({ monthlyPriceLabel }: { monthlyPriceLabel: string }) {
  const FAQ: FaqEntry[] = [
    {
      q: "Does paykit hold my money?",
      a: "No. paykit only renders your checkout — a PayNow QR, or your own payment link/QR — and tracks its status. Customers pay you directly — paykit never touches funds.",
    },
    {
      q: "How do I know a payment came through?",
      a: "A customer marks an order as paid after scanning; you confirm it yourself once you see it land in your bank account. There's no automatic bank-side verification.",
    },
    {
      q: "Do I need a business bank account?",
      a: "No — use PayNow with your UEN or personal mobile number, or bring your own payment link/QR (GrabPay, HitPay, Qashier, or your bank's own) instead.",
    },
    {
      q: "What does the free plan include?",
      a: `Unlimited transactions on the free plan, no cap. Pro adds refund tracking, ${monthlyPriceLabel}.`,
    },
  ];

  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-16">
      {/* unchanged */}
      <div className="mt-10 space-y-3">
        {FAQ.map((item) => (
          <FaqItem key={item.q} {...item} />
        ))}
      </div>
    </section>
  );
}
```

(If `pro-simplification` has already landed, this FAQ answer already reads
"Unlimited transactions and revenue stats on the free plan..." — keep that
wording, only the price fragment changes here.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/landing/benefits.tsx src/components/landing/faq.tsx
git commit -m "feat: show the live Pro price on the landing page"
```

---

### Task 9: `AGENTS.md`

**Files:**

- Modify: `AGENTS.md`

- [ ] **Step 1: Add the `pricing` table to the Data model section**

Insert a new bullet near the `plan` line:

> `pricing` (single row, `id` pinned to 1): the Pro price shown on the
> plan page, dashboard nudge, and landing site. Admin-tunable via
> `/admin` (no redeploy needed) — see `paykit.pricing`,
> `src/lib/pricing.ts`. Public-read RLS (the price isn't secret); writes
> go through the service-role `setPricing` action only. Seeded at
> `monthly_cents = 499` ($4.99).

- [ ] **Step 2: Correct the `plan` line's price reference**

Change whatever `plan` line currently reads (with a literal `$4/mo` or
`$12/mo`) so the price fragment reads: "Pro price is admin-tunable via
`/admin` (seeded at $4.99/mo) — see `paykit.pricing`" instead of any
hardcoded dollar figure.

- [ ] **Step 3: Add the two new files to File Layout**

```
src/lib/pricing.ts                — PricingConfig, DEFAULT_PRICING, getPricing() (shared by admin/dashboard/landing)
src/app/admin/pricing-section.tsx — @merqo/ui PricingForm wired to setPricing + toast
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document admin-tunable pricing in AGENTS.md"
```

---

### Task 10: READMEs

**Files:**

- Modify: `src/app/admin/README.md`
- Modify: `src/app/dashboard/plan/README.md`
- Modify: `docs/superpowers/specs/README.md`
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: `src/app/admin/README.md`**

Contents section's `actions.ts` bullet gains a `setPricing` mention
(mirroring how it already documents `setVendorPlan`); add a new bullet
for `pricing-section.tsx` (`PricingSection`: wraps `@merqo/ui`'s
`PricingForm`, wires `setPricing` + the sonner toast convention); `page.tsx`'s
bullet gains a mention of the new Pricing section.

- [ ] **Step 2: `src/app/dashboard/plan/README.md`**

Purpose line's price/mechanism description updates to note the price is
now read live from `paykit.pricing` (admin-tunable), not a hardcoded
constant; `page.tsx`'s Contents bullet notes it now also fetches
`getPricing`.

- [ ] **Step 3: `docs/superpowers/specs/README.md`**

Add, after the `2026-08-15-paykit-pro-simplification-design.md` entry:

```
- `2026-08-15-paykit-admin-pricing-design.md` — "paykit — Admin-Tunable Pricing: $4.99/mo — Design": replaces the hardcoded `PRO_PRICE` constant with a single-row `paykit.pricing` table an admin edits live from `/admin` (mirrors qkit's own admin-pricing pattern), wiring in `@merqo/ui`'s new shared `PricingForm` component as paykit's first real adopter, and corrects the price itself from $4/mo to $4.99/mo (a charm-pricing correction, not a new argument — see the per-kit pricing rationale doc).
```

- [ ] **Step 4: `docs/superpowers/plans/README.md`**

Add, after the `2026-08-15-paykit-pro-simplification.md` entry:

```
- `2026-08-15-paykit-admin-pricing.md` — "paykit Admin-Tunable Pricing Implementation Plan": adds the `paykit.pricing` table, a `setPricing` admin action, and a `PricingSection` wrapper around `@merqo/ui`'s new `PricingForm`, then switches every price call site (plan page, dashboard nudge, landing copy) from the old `PRO_PRICE` constant to a live DB read seeded at $4.99/mo.
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/README.md src/app/dashboard/plan/README.md docs/superpowers/specs/README.md docs/superpowers/plans/README.md
git commit -m "docs: update READMEs for admin-tunable pricing"
```

---

### Task 11: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full check + test**

Run: `pnpm check && pnpm test`
Expected: PASS, no lint/type/format errors, full suite green.

- [ ] **Step 2: Production build**

Run: `pnpm build`
Expected: PASS — this is the one gate that catches Next.js client/server
bundle-boundary errors `pnpm check`/`pnpm test` miss (per project rule);
in particular, confirm `pricing-section.tsx`'s `"use client"` boundary and
its `@merqo/ui` import resolve cleanly in the production bundle.

- [ ] **Step 3: If either step fails, fix and re-run before proceeding**

Do not open a PR on a red local gate.

---

## Self-Review Notes

- **Spec coverage:** migration + types (Task 1); shared `getPricing`
  reader (Task 2); `setPricing` action (Task 3); `resolvePlanView`'s live
  price (Task 4); admin wiring incl. the `@merqo/ui` version bump (Task 5);
  plan page (Task 6); dashboard nudge (Task 7); landing copy (Task 8);
  AGENTS.md (Task 9); READMEs (Task 10); verification (Task 11). Every
  "What changes" entry in the spec has a matching task.
- **Placeholder scan:** none — every task has real code/copy, not a
  skeleton; the one deliberately-approximate step is Task 6/8's "adjust to
  whatever `pro-simplification` has already left in place" language, which
  is a real, named ambiguity (documented sequencing risk), not a lazy
  placeholder.
- **Type consistency:** `resolvePlanView`'s new third parameter is a plain
  `number` (cents), matching `PricingConfig.monthly_cents`'s type exactly
  — no string-cents mismatch anywhere across the boundary. `PricingForm`'s
  own cents-in/cents-out contract (per its own plan) is respected end to
  end: `PricingSection` never touches a dollar string.
- **No schema/RLS overreach:** the only new table is `paykit.pricing`;
  every existing table/policy is untouched. Confirmed the new table has no
  write policy at all (service-role only), matching `kit_api_keys`' own
  "no policy, service-role-only" precedent in this same schema.
- **Sequencing risk named, not silently assumed:** Task 0's dependency
  check and Global Constraints both call out the unreleased `@merqo/ui`
  tag and the shared-file overlap with `pro-simplification` — a reviewer
  picking this plan up cold sees the risk before starting, not after
  hitting a merge conflict.
- **Cross-repo edit explicitly NOT done here:** the spec's Self-review
  already flags that
  `Merqo Business/docs/business/2026-07-30-cross-kit-pricing-and-billing-plan.md`
  still needs a $4.99 correction (currently targeted at $4 by
  `pro-simplification`'s own Task 5) — repeated here so this plan's own
  task list isn't mistaken for the complete set of files this pricing
  change eventually touches.

## Parent

[plans](README.md)
