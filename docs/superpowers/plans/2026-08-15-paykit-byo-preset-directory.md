# BYO Payment Preset Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a four-card preset picker (Stripe Payment Link, HitPay Payment Link,
PayLah! QR, Other/Custom) in front of the existing `pointer` (BYO) config form,
so a first-time vendor gets tailored "where to find this" copy and a soft
URL-shape warning instead of one blank label+link field.

**Architecture:** A new pure data module, `src/app/dashboard/config/pointer-presets.ts`,
holds the preset catalogue (`POINTER_PRESETS`, `POINTER_PRESET_ORDER`) and a
best-effort `derivePointerPreset(config)` re-derivation helper — no React, no
I/O, independently unit-testable. `payment-config-form.tsx`'s existing
`kind === "pointer"` branch grows one more piece of client state (`preset`)
that drives which mode is locked, what pre-fills `label`, and which
instruction/warning copy renders — the submitted form fields (`kind`, `label`,
`url`/`qr_image_url`) are byte-for-byte unchanged from today, so
`saveConfigAction` and `src/lib/schemas.ts` are untouched.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Vitest + Testing
Library (jsdom), shadcn/ui (`RadioGroup`/`RadioGroupItem`), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-14-paykit-byo-preset-directory-design.md`

## Global Constraints

- Free tier, always — no Pro-gating of any kind on this feature.
- No PSP integration of any kind — no OAuth, no API keys, no calls to any
  PSP's API. Validation is string-pattern matching only, and it never blocks
  save.
- v1 preset shortlist is exactly: Stripe Payment Link, HitPay Payment Link,
  PayLah! QR, Other/Custom. No other presets.
- No new `vendor_payment_config` column, no new Zod schema field, no DB
  migration. `preset` is form-local UI state only — never sent to the server
  action. `vendorPaymentConfigInputSchema`'s `pointer` branch
  (`src/lib/schemas.ts`) is untouched.
- Only Stripe (`urlPattern: /^https:\/\/buy\.stripe\.com\//`) and HitPay
  (`urlPattern: /hit-pay\.com/`) get soft URL validation. PayLah! is
  QR-image-upload only, no URL field, no pattern. Other/Custom keeps today's
  exact manual label + link/QR toggle + generic hint behavior byte-for-byte.
- Preset re-derivation on edit is best-effort: only Stripe/HitPay URLs
  re-derive reliably; everything else (including a previously-selected
  PayLah! QR) falls back to `"other"`. This is expected, not a bug.
- TypeScript strict — no `any`, no `@ts-ignore` (AGENTS.md).
- Work on a feature branch, never commit directly to `main`.
- Commit messages follow Conventional Commits.
- Run `pnpm check && pnpm test` before considering any task done; run
  `pnpm build` before opening the PR (this touches a client component —
  `pnpm check`/`pnpm test` miss Next.js client/server bundle-boundary
  errors, per project rule).

---

### Task 0: Branch setup

**Files:** none

- [ ] **Step 1: Create and switch to a feature branch off `main`**

```bash
git fetch origin main
git checkout -b feat/byo-preset-directory origin/main
```

- [ ] **Step 2: Confirm baseline tests pass**

Run: `pnpm test`
Expected: all existing tests PASS.

---

### Task 1: Add the preset catalogue and re-derivation helper

**Files:**

- Create: `src/app/dashboard/config/pointer-presets.ts`
- Test: `src/app/dashboard/config/pointer-presets.test.ts`

**Interfaces:**

- Consumes: nothing (pure data module).
- Produces: `PointerPresetId`, `PointerPresetMode`, `PointerPreset`,
  `POINTER_PRESETS: Record<PointerPresetId, PointerPreset>`,
  `POINTER_PRESET_ORDER: PointerPresetId[]`,
  `derivePointerPreset(config: { url: string | null; qr_image_url: string | null }): PointerPresetId`
  — consumed by Task 2's `payment-config-form.tsx`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/dashboard/config/pointer-presets.test.ts
import { describe, it, expect } from "vitest";
import {
  POINTER_PRESETS,
  POINTER_PRESET_ORDER,
  derivePointerPreset,
} from "./pointer-presets";

describe("POINTER_PRESETS", () => {
  it("has exactly the v1 shortlist, in order: stripe, hitpay, paylah, other", () => {
    expect(POINTER_PRESET_ORDER).toEqual([
      "stripe",
      "hitpay",
      "paylah",
      "other",
    ]);
    expect(Object.keys(POINTER_PRESETS).sort()).toEqual(
      ["hitpay", "other", "paylah", "stripe"].sort(),
    );
  });

  it("stripe's urlPattern matches a real Stripe Payment Link and rejects an unrelated URL", () => {
    const { urlPattern } = POINTER_PRESETS.stripe;
    expect(urlPattern!.test("https://buy.stripe.com/test_abc123")).toBe(true);
    expect(urlPattern!.test("https://hit-pay.com/abc123")).toBe(false);
    expect(urlPattern!.test("https://evil.com/buy.stripe.com/fake")).toBe(
      false,
    );
  });

  it("hitpay's urlPattern matches any hit-pay.com subdomain and rejects an unrelated URL", () => {
    const { urlPattern } = POINTER_PRESETS.hitpay;
    expect(urlPattern!.test("https://securepayment.hit-pay.com/abc123")).toBe(
      true,
    );
    expect(urlPattern!.test("https://hit-pay.com/pay/abc123")).toBe(true);
    expect(urlPattern!.test("https://buy.stripe.com/test_abc123")).toBe(false);
  });

  it("paylah has no urlPattern (QR-image-only preset)", () => {
    expect(POINTER_PRESETS.paylah.urlPattern).toBeUndefined();
  });

  it("other has no urlPattern and an empty labelSuggestion (never overwrites a vendor's label)", () => {
    expect(POINTER_PRESETS.other.urlPattern).toBeUndefined();
    expect(POINTER_PRESETS.other.labelSuggestion).toBe("");
  });
});

describe("derivePointerPreset", () => {
  it("derives stripe from a buy.stripe.com URL", () => {
    expect(
      derivePointerPreset({
        url: "https://buy.stripe.com/test_abc123",
        qr_image_url: null,
      }),
    ).toBe("stripe");
  });

  it("derives hitpay from a hit-pay.com URL", () => {
    expect(
      derivePointerPreset({
        url: "https://securepayment.hit-pay.com/abc123",
        qr_image_url: null,
      }),
    ).toBe("hitpay");
  });

  it("falls back to other for an unrelated URL", () => {
    expect(
      derivePointerPreset({
        url: "https://pay.example/kopitiam",
        qr_image_url: null,
      }),
    ).toBe("other");
  });

  it("falls back to other for a qr_image_url-only config (indistinguishable PayLah! QR)", () => {
    expect(
      derivePointerPreset({
        url: null,
        qr_image_url: "https://cdn.example/qr.webp",
      }),
    ).toBe("other");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/app/dashboard/config/pointer-presets.test.ts`
Expected: FAIL — `Cannot find module './pointer-presets'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/dashboard/config/pointer-presets.ts
//
// Pure data module for the BYO preset picker — no React, no I/O. See
// docs/superpowers/specs/2026-08-14-paykit-byo-preset-directory-design.md.

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/app/dashboard/config/pointer-presets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/config/pointer-presets.ts src/app/dashboard/config/pointer-presets.test.ts
git commit -m "feat: add BYO payment preset catalogue and re-derivation helper"
```

---

### Task 2: Wire the preset picker into `payment-config-form.tsx`

**Files:**

- Modify: `src/app/dashboard/config/payment-config-form.tsx`
- Test: `src/app/dashboard/config/payment-config-form.dom.test.tsx` (extend)

**Interfaces:**

- Consumes: `POINTER_PRESETS`, `POINTER_PRESET_ORDER`, `PointerPresetId`,
  `derivePointerPreset` from Task 1's `./pointer-presets`.
- Produces: no new exports — `PaymentConfigForm`'s public props are
  unchanged (`initial`, `vendorId`).

- [ ] **Step 1: Write the failing tests**

Append these `it` blocks inside the existing `describe("PaymentConfigForm", ...)`
in `src/app/dashboard/config/payment-config-form.dom.test.tsx` (keep every
existing test as-is):

```typescript
  it("defaults the preset picker to Stripe for a brand-new pointer config, shows its instructions, and pre-fills the label", async () => {
    const user = userEvent.setup();
    render(<PaymentConfigForm initial={null} vendorId="v1" />);

    await user.click(
      screen.getByRole("radio", { name: /payment link or qr image/i }),
    );

    expect(
      screen.getByRole("radio", { name: "Stripe Payment Link" }),
    ).toBeChecked();
    expect(
      screen.getByText(/Stripe Dashboard → Payment Links/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Button label")).toHaveValue(
      "Pay with Stripe",
    );
    // Stripe/HitPay/PayLah! lock the mode — no link/QR toggle shown.
    expect(
      screen.queryByRole("radio", { name: "Use a payment link" }),
    ).not.toBeInTheDocument();
  });

  it("switching to HitPay shows HitPay instructions and pre-fills the label only when it was empty", async () => {
    const user = userEvent.setup();
    render(<PaymentConfigForm initial={null} vendorId="v1" />);

    await user.click(
      screen.getByRole("radio", { name: /payment link or qr image/i }),
    );
    await user.click(
      screen.getByRole("radio", { name: "HitPay Payment Link" }),
    );

    expect(
      screen.getByText(/HitPay Dashboard → Payment Links/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Button label")).toHaveValue(
      "Pay with HitPay",
    );

    await user.clear(screen.getByLabelText("Button label"));
    await user.type(screen.getByLabelText("Button label"), "My Stall");
    await user.click(
      screen.getByRole("radio", { name: "Stripe Payment Link" }),
    );

    // Label was already set by the vendor — switching presets must not clobber it.
    expect(screen.getByLabelText("Button label")).toHaveValue("My Stall");
  });

  it("selecting PayLah! locks QR mode, shows the image uploader, and hides the link field", async () => {
    const user = userEvent.setup();
    render(<PaymentConfigForm initial={null} vendorId="v1" />);

    await user.click(
      screen.getByRole("radio", { name: /payment link or qr image/i }),
    );
    await user.click(screen.getByRole("radio", { name: "PayLah! QR" }));

    expect(screen.getByTestId("image-uploader")).toBeInTheDocument();
    expect(screen.queryByLabelText("Payment link")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Open DBS PayLah! → your QR code screen/),
    ).toBeInTheDocument();
  });

  it("selecting Other shows the link/QR toggle exactly as today, with the generic instructions", async () => {
    const user = userEvent.setup();
    render(<PaymentConfigForm initial={null} vendorId="v1" />);

    await user.click(
      screen.getByRole("radio", { name: /payment link or qr image/i }),
    );
    await user.click(screen.getByRole("radio", { name: "Other / custom" }));

    expect(
      screen.getByRole("radio", { name: "Use a payment link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Use a QR image" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/GrabPay, ShopeePay, Qashier/),
    ).toBeInTheDocument();
  });

  it("warns on a non-matching URL under Stripe without blocking save, and clears once it matches", async () => {
    const user = userEvent.setup();
    render(<PaymentConfigForm initial={null} vendorId="v1" />);

    await user.click(
      screen.getByRole("radio", { name: /payment link or qr image/i }),
    );
    await user.type(screen.getByLabelText("Payment link"), "https://example.com/pay");

    expect(
      screen.getByText(/doesn't look like a Stripe Payment Link/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save payment config/i }),
    ).not.toBeDisabled();

    await user.clear(screen.getByLabelText("Payment link"));
    await user.type(
      screen.getByLabelText("Payment link"),
      "https://buy.stripe.com/test_abc123",
    );

    expect(
      screen.queryByText(/doesn't look like a Stripe Payment Link/),
    ).not.toBeInTheDocument();
  });

  it("re-derives the Stripe preset from an existing pointer config's URL on edit", () => {
    render(
      <PaymentConfigForm
        vendorId="v1"
        initial={{
          vendor_id: "v1",
          kind: "pointer",
          uen: null,
          mobile: null,
          payee_name: null,
          label: "Pay with Stripe",
          url: "https://buy.stripe.com/test_abc123",
          qr_image_url: null,
          verification_method: "manual",
          plan: "free",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        }}
      />,
    );

    expect(
      screen.getByRole("radio", { name: "Stripe Payment Link" }),
    ).toBeChecked();
  });

  it("falls back to the Other preset on edit for a URL that matches no known preset", () => {
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

    expect(
      screen.getByRole("radio", { name: "Other / custom" }),
    ).toBeChecked();
    // Existing saved data still displays correctly under the Other fallback.
    expect(screen.getByLabelText("Payment link")).toHaveValue(
      "https://pay.example/kopitiam",
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/app/dashboard/config/payment-config-form.dom.test.tsx`
Expected: FAIL — new assertions don't match current markup (no preset radio
cards exist yet, label doesn't auto-fill, no instructions/warning text).

- [ ] **Step 3: Write the implementation**

In `src/app/dashboard/config/payment-config-form.tsx`:

Add the import, after the existing `type { PaymentConfigKind, VendorPaymentConfig }` import:

```typescript
import {
  POINTER_PRESETS,
  POINTER_PRESET_ORDER,
  derivePointerPreset,
  type PointerPresetId,
} from "./pointer-presets";
```

Add preset state, directly after the existing `pointerMode` state declaration:

```typescript
const [preset, setPreset] = useState<PointerPresetId>(() =>
  initial?.kind === "pointer" ? derivePointerPreset(initial) : "stripe",
);
```

Add the preset-change handler, directly above the `return (`:

```typescript
function handlePresetChange(id: PointerPresetId) {
  setPreset(id);
  const next = POINTER_PRESETS[id];
  if (next.mode !== "choice") {
    setPointerMode(next.mode);
  }
  if (!label) {
    setLabel(next.labelSuggestion);
  }
}
```

Replace the entire `{kind === "pointer" && ( ... )}` block with:

```tsx
{
  kind === "pointer" && (
    <>
      <div className="space-y-2">
        <Label>Preset</Label>
        <RadioGroup
          value={preset}
          onValueChange={(v) => handlePresetChange(v as PointerPresetId)}
          className="grid grid-cols-2 gap-2.5"
        >
          {POINTER_PRESET_ORDER.map((id) => {
            const p = POINTER_PRESETS[id];
            const selected = preset === id;
            return (
              <label
                key={id}
                className={
                  selected
                    ? "flex cursor-pointer items-start gap-2 rounded-xl border border-primary bg-primary/5 px-3 py-2.5 ring-1 ring-primary/30"
                    : "flex cursor-pointer items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5 hover:bg-secondary/50"
                }
              >
                <RadioGroupItem
                  value={id}
                  aria-label={p.cardLabel}
                  className="mt-0.5"
                />
                <span className="text-sm font-medium">{p.cardLabel}</span>
              </label>
            );
          })}
        </RadioGroup>
      </div>

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

      {preset === "other" && (
        <RadioGroup
          value={pointerMode}
          onValueChange={(v) => setPointerMode(v as PointerMode)}
          className="flex gap-4"
        >
          <span className="flex items-center gap-2">
            <RadioGroupItem value="link" aria-label="Use a payment link" />{" "}
            Payment link
          </span>
          <span className="flex items-center gap-2">
            <RadioGroupItem value="qr" aria-label="Use a QR image" /> QR image
          </span>
        </RadioGroup>
      )}

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
            {POINTER_PRESETS[preset].instructions}
          </p>
          {POINTER_PRESETS[preset].urlPattern &&
            url &&
            !POINTER_PRESETS[preset].urlPattern!.test(url) && (
              <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
                {POINTER_PRESETS[preset].urlWarning}
              </p>
            )}
          {isValidHttpUrl(url) && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Open link
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Label>QR image</Label>
          <ImageUploader
            bucket="vendor-images"
            pathPrefix={vendorId}
            value={qrImageUrl}
            onChange={setQrImageUrl}
            onUpload={uploadPaykitImage}
            resizeImage={resizeToWebp}
            imageComponent={Image}
            variant="thumb"
          />
          <input type="hidden" name="qr_image_url" value={qrImageUrl ?? ""} />
          <p className="text-xs text-muted-foreground">
            {POINTER_PRESETS[preset].instructions}
          </p>
        </div>
      )}
    </>
  );
}
```

Note: the `pointerMode` initial-state derivation (existing code, just above
the new `preset` state) is unchanged — it still reads
`initial?.kind === "pointer" && initial.qr_image_url && !initial.url ? "qr" : "link"`.
This still runs before `preset` derivation and both derive independently
from the same `initial`, so a saved PayLah!-shaped QR-only config still
opens in QR mode (via `pointerMode`) even though its preset falls back to
`"other"` (via `derivePointerPreset`) per the spec's re-derivation
trade-off.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/app/dashboard/config/payment-config-form.dom.test.tsx`
Expected: PASS — all existing tests plus the new ones from Step 1.

- [ ] **Step 5: Full unit/lint/type gate**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/config/payment-config-form.tsx src/app/dashboard/config/payment-config-form.dom.test.tsx
git commit -m "feat: add BYO preset picker to the pointer payment config form"
```

---

### Task 3: Update `src/app/dashboard/config/README.md`

**Files:**

- Modify: `src/app/dashboard/config/README.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Add a `pointer-presets.ts` bullet and extend the `payment-config-form.tsx` bullet**

In the `## Contents` list, insert a new bullet directly after the
`page.tsx` bullet and before the existing `payment-config-form.tsx` bullet:

```markdown
- `pointer-presets.ts` — pure data module for the BYO preset picker: the
  `POINTER_PRESETS` catalogue (Stripe Payment Link, HitPay Payment Link,
  PayLah! QR, Other/Custom), `POINTER_PRESET_ORDER`, and
  `derivePointerPreset()` — a best-effort re-derivation of which preset an
  existing saved `pointer` config likely came from, used to pre-select the
  picker on edit. UI-only: no preset ID is persisted, see
  `docs/superpowers/specs/2026-08-14-paykit-byo-preset-directory-design.md`.
```

Update the existing `payment-config-form.tsx` bullet's first sentence from:

```markdown
- `payment-config-form.tsx` — client form: radio-toggles between PayNow/BYO
  `kind`, live-previews the generated PayNow QR, and for the BYO `qr_image_url`
  field uses `@merqo/ui`'s `ImageUploader` (wired through
  `uploadPaykitImage`/`resizeToWebp` from `src/lib/`, `imageComponent={Image}`,
  `variant="thumb"`).
```

to:

```markdown
- `payment-config-form.tsx` — client form: radio-toggles between PayNow/BYO
  `kind`; for BYO, a `pointer-presets.ts` card picker drives which mode
  (link vs QR) is locked, what pre-fills the label, and which "where to
  find this" instructions/URL-shape warning render, before falling through
  to the same link input or `@merqo/ui` `ImageUploader` (wired through
  `uploadPaykitImage`/`resizeToWebp` from `src/lib/`, `imageComponent={Image}`,
  `variant="thumb"`) as before; live-previews the generated PayNow QR for
  the `paynow` branch.
```

Add a bullet for the new test file, directly after the existing
`payment-config-form.dom.test.tsx` bullet:

```markdown
- `pointer-presets.test.ts` — unit coverage for every preset's `urlPattern`
  (where present) and `derivePointerPreset()`'s Stripe/HitPay/fallback
  branches.
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/config/README.md
git commit -m "docs: document pointer-presets.ts in config README"
```

---

### Task 4: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full check + test**

Run: `pnpm check && pnpm test`
Expected: PASS, no lint/type/format errors, full suite green.

- [ ] **Step 2: Production build (catches client/server bundle-boundary errors)**

Run: `pnpm build`
Expected: PASS. This form is a client component (`"use client"`) importing
a new plain-data module (`pointer-presets.ts`, no server-only imports) — the
build must succeed with no boundary violation.

- [ ] **Step 3: If either step fails, fix and re-run before proceeding**

Do not open a PR on a red local gate.

---

## Self-Review Notes

- **Spec coverage:** `pointer-presets.ts` data module + tests (Task 1); the
  picker UI, mode-locking, label pre-fill-without-clobber, instructions
  copy, and Stripe/HitPay soft URL warning (Task 2); README documentation
  update (Task 3, per project memory on keeping READMEs current in the same
  change). Out-of-scope items from the spec (PSP integration, regional
  rails, preset persistence, GrabPay/ShopeePay/FavePay presets) have no
  task — correctly, since the spec rules them out.
- **Placeholder scan:** none — every step has real code, real test
  assertions, real copy strings lifted verbatim from the spec.
- **Type consistency:** `PointerPresetId`/`PointerPresetMode`/`PointerPreset`
  defined once in Task 1 and imported, not redefined, in Task 2.
  `derivePointerPreset`'s parameter shape (`{ url: string | null; qr_image_url: string | null }`)
  matches the fields Task 2 passes it (`initial`, itself a
  `VendorPaymentConfig`, which is a superset of that shape).
  `handlePresetChange` only ever calls `setPointerMode` with
  `next.mode` narrowed to `"link" | "qr"` (guarded by `next.mode !== "choice"`),
  matching `PointerMode`'s existing `"link" | "qr"` type exactly.
- **No schema/migration touch:** confirmed no task modifies
  `src/lib/schemas.ts`, `src/app/dashboard/config/actions.ts`, or
  `supabase/migrations/` — the picker is additive UI state only, per the
  spec's "no new database columns" and "Presets are UI-only" guiding
  decisions.
