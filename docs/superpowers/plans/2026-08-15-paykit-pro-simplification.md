# paykit Pro Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut Pro's price from $12/mo to $4/mo, move the stats/revenue
chart to Free (transaction tracking was already free — confirmed, no
change needed there), and leave refund tracking as Pro's one remaining
gate. No second tier, no schema/migration/RLS change — `VendorPlan` stays
`"free" | "pro"`. Auto-verify is documented as a future, BYO-PSP-only Pro
perk but not implemented here.

**Architecture:** Pure pricing/copy/feature-gate correction across
`plan-view.ts`, the stats page, the two nudge-copy call sites, and
marketing copy — no new module, no new type, no new database column.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Vitest + Testing
Library (jsdom), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-15-paykit-pro-simplification-design.md`

## Global Constraints

- `VendorPlan` stays exactly `"free" | "pro"` — no new value, no migration,
  no RLS change.
- Refund tracking remains the one Pro-exclusive gate. Do not gate anything
  else behind `plan === "pro"` in this plan.
- No auto-verify implementation of any kind — `verification_method` stays
  schema-reserved, `'manual'`-only, untouched.
- TypeScript strict — no `any`, no `@ts-ignore` (AGENTS.md).
- Work on a feature branch, never commit directly to `main`.
- Commit messages follow Conventional Commits.
- Run `pnpm check && pnpm test` before considering any task done; run
  `pnpm build` before opening the PR (touches client/server pages — `pnpm
check`/`pnpm test` miss Next.js client/server bundle-boundary errors, per
  project rule).

---

### Task 0: Branch setup

**Files:** none

- [ ] **Step 1: Create and switch to a feature branch off `main`**

```bash
git fetch origin main
git checkout -b feat/pro-simplification origin/main
```

- [ ] **Step 2: Confirm baseline tests pass**

Run: `pnpm test`
Expected: all existing tests PASS.

---

### Task 1: Update `plan-view.ts`

**Files:**

- Modify: `src/lib/plan-view.ts`
- Modify: `src/lib/plan-view.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `PRO_PRICE = "$4/mo"`, `features` list with stats in both
  branches and refund tracking only in `pro`'s — consumed by
  `dashboard/page.tsx`, `plan/page.tsx`.

- [ ] **Step 1: Update the failing tests first**

In `src/lib/plan-view.test.ts`, update the existing `PRO_PRICE` assertion
to `"$4/mo"` and the `features` assertions:

```ts
it("free includes revenue stats but not refund tracking", () => {
  expect(resolvePlanView("free", 0).features).toEqual([
    "Unlimited transactions",
    "Revenue stats",
  ]);
});

it("pro includes refund tracking on top of everything free has", () => {
  expect(resolvePlanView("pro", 0).features).toEqual([
    "Unlimited transactions",
    "Revenue stats",
    "Refund tracking",
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/plan-view.test.ts`
Expected: FAIL — current code still returns `$12/mo` and the old feature
lists.

- [ ] **Step 3: Write the implementation**

In `src/lib/plan-view.ts`:

```ts
export const PRO_PRICE = "$4/mo";
```

```ts
features: isPro
  ? ["Unlimited transactions", "Revenue stats", "Refund tracking"]
  : ["Unlimited transactions", "Revenue stats"],
```

(`isPro` is the existing `plan === "pro"` local — keep as-is.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/plan-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-view.ts src/lib/plan-view.test.ts
git commit -m "feat: cut Pro to \$4/mo and move revenue stats to the free feature list"
```

---

### Task 2: Un-gate the stats page

**Files:**

- Modify: `src/app/dashboard/stats/page.tsx`
- Modify: `src/app/dashboard/stats/page.dom.test.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: no exports change — same default export, now single-branch.

- [ ] **Step 1: Update the failing tests first**

In `page.dom.test.tsx`, delete the existing Free-tier upsell-branch test.
Add (or promote the existing Pro-branch test to run unconditionally, no
plan mock needed):

```ts
it("renders the revenue chart for every vendor regardless of plan", async () => {
  // arrange listTransactions/aggregateRevenueByDay mocks as today's
  // Pro-branch test already does
  const result = await StatsPage();
  render(result);
  expect(screen.getByText(/confirmed revenue by day/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/app/dashboard/stats/page.dom.test.tsx`
Expected: FAIL — current code still gates on `getVendorPlan`.

- [ ] **Step 3: Write the implementation**

Replace `src/app/dashboard/stats/page.tsx` in full:

```tsx
import { getVendorSession } from "@/lib/vendor-session";
import { listTransactions } from "@/lib/transactions";
import { aggregateRevenueByDay } from "@/lib/revenue-report";
import { RevenueChart } from "./revenue-chart";

export default async function StatsPage() {
  const { user } = await getVendorSession();

  const transactions = await listTransactions(user.id);
  const data = aggregateRevenueByDay(transactions);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Confirmed revenue by day, aggregated across every kit.
      </p>
      <div className="mt-6">
        <RevenueChart data={data} />
      </div>
    </div>
  );
}
```

(`getVendorPlan` import and the `config` variable are removed entirely —
nothing else in this file reads plan.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/app/dashboard/stats/page.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/stats/page.tsx src/app/dashboard/stats/page.dom.test.tsx
git commit -m "feat: make the revenue stats page free for every vendor"
```

---

### Task 3: Fix the nudge copy on `dashboard/page.tsx` and `plan/page.tsx`

**Files:**

- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard/page.dom.test.tsx`
- Modify: `src/app/dashboard/plan/page.tsx`
- Modify: `src/app/dashboard/plan/page.dom.test.tsx`

**Interfaces:**

- Consumes: `PRO_PRICE` from Task 1's `plan-view.ts` (`plan/page.tsx`
  already imports it; `dashboard/page.tsx` currently hardcodes the string
  and should switch to importing the constant instead, so the two call
  sites can never drift again).

- [ ] **Step 1: Update the failing tests first**

In both `page.dom.test.tsx` files, update any assertion matching the old
nudge text (`/stats and refund tracking, \$12\/mo/i` or similar) to the new
copy (`/refund tracking, \$4\/mo/i`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/app/dashboard/page.dom.test.tsx src/app/dashboard/plan/page.dom.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

In `src/app/dashboard/page.tsx`, add the import:

```ts
import { PRO_PRICE } from "@/lib/plan-view";
```

Replace the nudge paragraph:

```tsx
<p className="text-sm font-medium">
  You&apos;re doing real volume —{" "}
  <Link href="/dashboard/plan" className="underline underline-offset-4">
    Pro
  </Link>{" "}
  adds refund tracking, {PRO_PRICE}.
</p>
```

In `src/app/dashboard/plan/page.tsx`, the nudge block already imports
`PRO_PRICE` — just change its copy:

```tsx
{
  view.showNudge && (
    <p className="mt-2 text-sm text-muted-foreground">
      You&apos;re doing real volume — Pro adds refund tracking, {PRO_PRICE}.
    </p>
  );
}
```

And the upgrade-CTA paragraph:

```tsx
<p className="text-sm text-muted-foreground">
  Ask us to upgrade your account to Pro for refund tracking, {PRO_PRICE}.
</p>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/app/dashboard/page.dom.test.tsx src/app/dashboard/plan/page.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/dashboard/page.dom.test.tsx src/app/dashboard/plan/page.tsx src/app/dashboard/plan/page.dom.test.tsx
git commit -m "fix: correct Pro nudge copy to \$4/mo, refund tracking only"
```

---

### Task 4: Landing copy, README, and AGENTS.md

**Files:**

- Modify: `src/components/landing/benefits.tsx`
- Modify: `src/components/landing/faq.tsx`
- Modify: `AGENTS.md`
- Modify: `src/app/dashboard/stats/README.md`
- Modify: `src/app/dashboard/plan/README.md`
- Modify: any landing component test asserting the old copy strings
  (search first: `grep -rln "12/mo\|stats and refund" src/components/landing/`)

- [ ] **Step 1: Update `benefits.tsx`**

Change the "Free while you're small" tile's paragraph to:

```tsx
<p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
  Unlimited transactions and revenue stats, no card required. Pro adds refund
  tracking — {"$4/mo"}, once you&apos;re doing enough volume to want it.
</p>
```

(Inline the literal string here — this is a server-rendered marketing
component with no existing import of `plan-view.ts`; importing a
dashboard-lib constant into the public landing page is unnecessary
coupling for one string. If a lint rule flags the literal, import
`PRO_PRICE` instead — check `pnpm check` output before deciding.)

- [ ] **Step 2: Update `faq.tsx`**

Change the "What does the free plan include?" answer to: `"Unlimited
transactions and revenue stats on the free plan, no cap. Pro adds refund
tracking, $4/mo."`

- [ ] **Step 3: Update any landing test asserting the old copy**

Run the grep from this task's Files list; fix any matches.

- [ ] **Step 4: Update `AGENTS.md`**

Data model section's `plan` line: change to `plan (free|pro) gates refund
tracking only ($4/mo) — transaction history and revenue stats are both
free; Free tier checkout is unlimited, no transaction-volume cap`.

Delete the stale trailing sentence in "Project-Specific Notes" that still
says qkit's checkout flow "has not yet been switched over to `POST
/api/v1/checkout`" — contradicted by this file's own top section (cutover
already documented complete, 2026-08-15).

- [ ] **Step 5: Update `stats/README.md` and `plan/README.md`**

`stats/README.md`: Purpose line drops "Pro only — Free vendors see an
upsell instead of the chart"; `page.tsx` bullet in Contents describes the
single unconditional branch (no Free/Pro split left to document).

`plan/README.md`: any "$12/mo" or "stats + refunds" phrasing corrects to
"$4/mo" / refunds-only.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/benefits.tsx src/components/landing/faq.tsx AGENTS.md src/app/dashboard/stats/README.md src/app/dashboard/plan/README.md
git commit -m "docs: correct paykit pricing copy across landing, READMEs, AGENTS.md"
```

---

### Task 5: Update the cross-kit pricing plan doc (Merqo Business/docs/business)

**Files (outside this repo — parent `Merqo Business/docs/business/`):**

- Modify: `2026-07-30-cross-kit-pricing-and-billing-plan.md`

- [ ] **Step 1: Update paykit's row**

Per-kit pricing table: change paykit's row from `$7/mo (down from the $12
already live in copy — needs a copy update)` to `$4/mo (shipped
2026-08-15; supersedes this doc's earlier $7 proposal, which was never
shipped)`.

- [ ] **Step 2: Recompute the standalone sum and bundle-discount examples**

Standalone sum: `14 + 14 + 9 + 4 = $41/mo` (was stated as $44, based on the
never-shipped $7).

Bundle-discount example rows: recompute each using paykit at $4 instead of
$7 (e.g. the 2-kit "qkit+paykit" example, the 4-kit total).

- [ ] **Step 3: Reassess All-Access ($31) against the corrected 4-kit bundle**

Recompute the 30%-off 4-kit bundle total with paykit at $4:
`(14 + 14 + 9 + 4) × 0.70 = $28.70`. All-Access at $31 is now *above* the
real 4-kit bundle, inverting the doc's own "priced equal to, not below,
the bundle" intent. Flag this explicitly in the doc rather than silently
leave it — either All-Access needs to drop to ~$29, or this is a decision
for whoever owns final pricing sign-off, not something to auto-resolve in
a docs-sync pass.

- [ ] **Step 4: Commit** (in the `Merqo Business` parent, not this repo —
      it is not a git repository; this step is a plain file save, no commit
      command applies here.)

---

### Task 6: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full check + test**

Run: `pnpm check && pnpm test`
Expected: PASS, no lint/type/format errors, full suite green.

- [ ] **Step 2: Production build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: If either step fails, fix and re-run before proceeding**

Do not open a PR on a red local gate.

---

## Self-Review Notes

- **Spec coverage:** pricing constant + feature-list change (Task 1);
  stats un-gating (Task 2); nudge-copy fix at both call sites (Task 3);
  landing/README/AGENTS.md copy (Task 4); cross-repo pricing-doc sync
  (Task 5); verification (Task 6). Every "What changes" file in the spec
  has a matching task. Auto-verify implementation correctly has no task —
  the spec explicitly defers it.
- **Placeholder scan:** none — every step has real code/copy lifted
  verbatim from the spec.
- **Type consistency:** no type changes in this plan at all — `VendorPlan`
  is untouched, confirmed by the spec's own "no schema change" decision.
- **No schema/migration/RLS touch confirmed:** no task modifies
  `src/lib/types.ts`, `supabase/migrations/`, or any RLS policy — this is
  the direct payoff of collapsing to one tier instead of adding a second.
- **Cross-repo edit flagged, not silently done:** Task 5 explicitly notes
  it edits a file outside this repo's own git history (the parent `Merqo
Business` folder is not a git repository) — kept as its own task so a
  reviewer running only this repo's diff doesn't miss that a sibling doc
  also needs updating.
