# paykit MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up paykit as a brand-new, standalone Next.js + Supabase repo — the Merqo family's shared PayNow payment engine — with its own `paykit` schema, a bearer-secret cross-kit HTTP API (`/api/v1/checkout` + claim/confirm/status/config), and a vendor dashboard (config, transaction log, Pro reports/refunds, free-tier usage meter).

**Architecture:** Next.js 16 App Router on Supabase (`@supabase/ssr`, schema `paykit`), scaffolded to match the sibling repos qkit/loopkit exactly (same templateCentral Supabase-variant harness, same shared Supabase project, different schema). The EMVCo PayNow QR builder (`buildPayNowPayload`/`crc16`/`tlv`) is ported verbatim from `qkit/src/lib/payments/paynow.ts`. A pure `pending → claimed → confirmed` state machine and Zod boundary schemas live in `src/lib` (mutation-tested). Every calling kit authenticates with a per-kit bearer secret (hashed, stored in `paykit.kit_api_keys`) and acts on a `vendor_id` it already trusts via the shared `auth.users`. No other kit calls paykit yet — this plan ships paykit standalone only; qkit's existing local payment code is untouched.

**Tech Stack:** Next.js 16 · TypeScript strict · Tailwind v4 · shadcn/ui (new-york, neutral) · Zod · `@supabase/ssr` · Vitest · Stryker (mutation, advisory) · pgTAP · pnpm 11 · Node ≥24 · Vercel. templateCentral nextjs Supabase-variant harness conventions (hand-scaffolded to match qkit's exact files, per the design spec's instruction to replicate, not regenerate).

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Next 16: `cookies()`/`headers()`/`params`/`searchParams` are async; route protection in `src/proxy.ts` (not `middleware.ts`).
- Every Supabase client (`src/lib/supabase/{client,server,middleware}.ts`) is scoped to `db: { schema: "paykit" }` — paykit owns that schema in the shared Merqo Supabase project and must never read/write another kit's schema directly.
- Authorization lives in **RLS policies**, not app code. Never widen a policy to "fix" a query.
- Use the **service-role client only** in Server Actions / Route Handlers, never in client components. The cross-kit HTTP API (`/api/v1/*`) is service-role + bearer-secret, server-only — the actor is another kit's server, never a logged-in paykit user.
- No secrets in `NEXT_PUBLIC_*`. No secrets in any HTTP response body — `qr_payload` is public-by-design (a PayNow QR always is); `kit_api_keys.secret_hash` is never selected into a response.
- Every write validated by Zod at the boundary.
- **paykit never touches funds** — no money-movement code, no payment-provider SDK, no ledger reconciliation beyond the bookkeeping `refunds` row. This is a hard invariant, not a v1-only choice.
- `disputed` transaction status and real auto-verify are **out of scope** — do not implement either. `verification_method: 'auto'` is schema-reserved only; its adapter function throws `"auto-verify not enabled"` and nothing in the app ever calls it (the vendor write schema never allows selecting `'auto'`).
- Free tier: 100 transactions/month **per vendor, counted across every kit** that used paykit for them. Pro removes the cap and unlocks revenue reports + refund ledger entries.
- Repo-level docs/prose/slugs/schema name are lowercase `paykit` from the first commit (per `docs/business/2026-07-15-kit-brand-naming-convention.md`). The PascalCase `PayKit` logo mark is a future visual-identity pass — out of scope here; do not add a stylized wordmark.
- Do not modify the sibling `qkit` repo. Do not build a `/api/merqo/metrics` endpoint or any other cross-kit integration beyond the five documented `/api/v1/*` endpoints — no other kit calls paykit in this scope.
- pnpm 11 pinned in `packageManager`. Package manager: pnpm only.
- Every task ends green on `pnpm check` (`prettier --check` + `eslint` + `tsc --noEmit`) and `pnpm test`.
- Comment hygiene (tc 5.8, matching qkit's cherry-picked 5.8 gate): own-line comments only (`no-inline-comments: error`, test/scripts files exempt), no commented-out code (`sonarjs/no-commented-code`), explain WHY not WHAT, no change-narration.
- No Playwright/e2e in this plan — the design spec's Testing section lists only Unit (mutation-tested `src/lib`), Contract, RLS (pgTAP), and DOM. Do not add an `e2e/` suite or `test:e2e` script.

---

### Task 1: Scaffold the repo — package/config files, deps, base app shell

**Files:**

- Create: `C:\Users\Clarence\Desktop\Coding\Merqo Business\paykit\package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `components.json`, `postcss.config.mjs`, `.prettierrc.json`, `vercel.json`, `pnpm-workspace.yaml`, `.env.example`, `.gitignore`, `stryker.conf.json`, `.husky/pre-commit`
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`
- Create: `test/setup.ts`

**Interfaces:**

- Produces: a buildable Next.js 16 app skeleton other tasks add files into. No app-level exports yet.

- [ ] **Step 1: `package.json`** — mirrors `qkit/package.json` (same dependency versions — same shared Supabase project, keep kits in lockstep), name changed to `paykit`, `driver.js`/`@hookform/resolvers`/`react-hook-form`/`@playwright/test` dropped (unused in this scope — no product tour, no e2e, dashboard forms use `useActionState` + server-side Zod instead of React Hook Form).

```json
{
  "name": "paykit",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@11.5.2",
  "engines": {
    "node": "24.x",
    "pnpm": ">=11"
  },
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:mutation": "stryker run",
    "check": "prettier --check . && eslint . && tsc --noEmit",
    "format": "prettier --write .",
    "prepare": "husky"
  },
  "dependencies": {
    "@supabase/ssr": "^0.10.3",
    "@supabase/supabase-js": "^2.48.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "next": "^16.2.7",
    "radix-ui": "^1.4.3",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "react-qr-code": "^2.0.15",
    "recharts": "^3.8.1",
    "sonner": "^1.7.1",
    "tailwind-merge": "^2.5.5",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3.2.0",
    "@stryker-mutator/core": "^9.6.1",
    "@stryker-mutator/vitest-runner": "^9.6.1",
    "@tailwindcss/postcss": "^4.0.0",
    "@tailwindcss/typography": "^0.5.15",
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^24.13.2",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitest/coverage-v8": "^3.2.6",
    "eslint": "^9.17.0",
    "eslint-config-next": "^16.2.7",
    "eslint-plugin-sonarjs": "4.1.0",
    "husky": "^9.1.7",
    "jsdom": "^29.1.1",
    "lint-staged": "^15.3.0",
    "prettier": "^3.4.2",
    "supabase": "^2.105.0",
    "tailwindcss": "^4.0.0",
    "tw-animate-css": "^1.2.5",
    "typescript": "^5.7.3",
    "vitest": "^3.2.6"
  },
  "lint-staged": {
    "*.{ts,tsx,mjs}": ["prettier --write", "eslint --fix"],
    "*.{json,md,css}": ["prettier --write"]
  }
}
```

- [ ] **Step 2: `tsconfig.json`** (identical to qkit's):

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] },
    "types": ["node"]
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: `next.config.ts`** (identical to qkit's — same shared Supabase project, same CSP shape):

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,

  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "54321" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },

  async headers() {
    const connectSrc =
      process.env.NODE_ENV === "production"
        ? "connect-src 'self' https://*.supabase.co wss://*.supabase.co"
        : "connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:54321 ws://127.0.0.1:54321";

    const imgSrc =
      process.env.NODE_ENV === "production"
        ? "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com"
        : "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com http://127.0.0.1:54321";

    const scriptSrc =
      process.env.NODE_ENV === "production"
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-XSS-Protection", value: "0" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              imgSrc,
              "font-src 'self' data:",
              connectSrc,
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 4: `eslint.config.mjs`** (identical to qkit's — same comment-hygiene gate):

```js
import next from "eslint-config-next";
import sonarjs from "eslint-plugin-sonarjs";

const eslintConfig = [
  ...next,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "supabase/**",
      "coverage/**",
      ".stryker-tmp/**",
      "reports/**",
    ],
  },
  {
    plugins: { sonarjs },
    rules: {
      "no-inline-comments": [
        "error",
        {
          ignorePattern:
            "eslint-|@ts-|prettier-|c8 |istanbul |webpackChunkName",
        },
      ],
      "sonarjs/no-commented-code": "error",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "**/test/**", "scripts/**"],
    rules: { "no-inline-comments": "off" },
  },
];

export default eslintConfig;
```

- [ ] **Step 5: `vitest.config.ts`** (identical shape to qkit's — dummy public Supabase env for the import-time validation in `src/lib/env.ts`):

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(rootDir, "src") },
  },
  test: {
    globals: true,
    environment: "node",
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-anon-key",
    },
    passWithNoTests: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.{test,spec}.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "**/index.ts"],
    },
  },
});
```

- [ ] **Step 6: `components.json`** (identical to qkit's — new-york, neutral base, same aliases):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "utils": "@/lib/utils",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 7: remaining generic config files, verbatim from qkit:**

`postcss.config.mjs`:

```js
const config = {
  plugins: { "@tailwindcss/postcss": {} },
};

export default config;
```

`.prettierrc.json`:

```json
{ "endOfLine": "auto" }
```

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["sin1"]
}
```

`pnpm-workspace.yaml`:

```yaml
allowBuilds:
  supabase: true
  esbuild: true
  sharp: true
  unrs-resolver: true

overrides:
  postcss@<8.5.10: ">=8.5.10"
  undici@<7.28.0: ">=7.28.0 <8"
  vite@<=6.4.2: ">=6.4.3 <7"
  qs@<6.15.2: ">=6.15.2"
```

`stryker.conf.json` (mutation testing scoped to `src/lib`, advisory-only — matches qkit's rationale):

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "_comment": "Mutation testing is scoped to src/lib — the pure, fast, deterministic business logic (EMVCo builder, tx state machine, Zod schemas). Components/actions/supabase clients are excluded: I/O- or DOM-bound, low-signal.",
  "testRunner": "vitest",
  "plugins": ["@stryker-mutator/vitest-runner"],
  "coverageAnalysis": "perTest",
  "mutate": [
    "src/lib/**/*.ts",
    "!src/lib/**/*.test.ts",
    "!src/lib/types.ts",
    "!src/lib/supabase/**"
  ],
  "reporters": ["clear-text", "progress"],
  "clearTextReporter": { "allowColor": false, "maxTestsToLog": 3 },
  "thresholds": { "high": 90, "low": 80, "break": null }
}
```

`.husky/pre-commit`:

```
npx lint-staged
```

`.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

`.gitignore`:

```
node_modules/
.next/
.env*
!.env.example
coverage/
.stryker-tmp/
reports/
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 8: base app shell.** `src/app/globals.css` (standard shadcn new-york neutral tokens — matches `components.json`'s `baseColor: "neutral"`; paykit's own branded theme/logo mark is deliberately deferred, see Global Constraints):

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

* {
  border-color: var(--color-border);
  outline-color: var(--color-ring);
}

body {
  background-color: var(--color-background);
  color: var(--color-foreground);
}
```

`src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "paykit",
  description: "The Merqo family's shared PayNow payment engine.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
```

`src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">paykit</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The Merqo family&apos;s shared PayNow payment engine. Vendors manage
        their PayNow setup and transactions at{" "}
        <a href="/dashboard" className="underline underline-offset-4">
          /dashboard
        </a>
        .
      </p>
    </main>
  );
}
```

`test/setup.ts` (identical to qkit's):

```ts
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
```

- [ ] **Step 9: install + shadcn primitives.** From `C:\Users\Clarence\Desktop\Coding\Merqo Business\paykit`:

```bash
pnpm install
pnpm dlx shadcn@latest add button input label radio-group table badge dialog
```

This generates `src/lib/utils.ts` (the `cn()` helper) and the primitives under `src/components/ui/` (CLI-managed — do not hand-edit them in later tasks).

- [ ] **Step 10: verify build.**

```bash
pnpm check
pnpm build
```

Expected: both succeed (the app has no Supabase-reading routes yet, so no env vars are required for the build).

- [ ] **Step 11: git init + first commit + push.**

```bash
git init
git add -A
git commit -m "chore: scaffold paykit (Next.js 16, Supabase variant, mirrors qkit/loopkit)"
gh repo create cljiahao/paykit --private --source=. --remote=origin --push
```

---

### Task 2: Harness docs — AGENTS.md, CLAUDE.md, README, spec/plan copies

**Files:**

- Create: `AGENTS.md`, `CLAUDE.md`, `README.md`
- Create: `docs/superpowers/specs/2026-07-15-paykit-mvp-design.md` (copy of the approved design spec)
- Create: `docs/superpowers/plans/2026-07-15-paykit-mvp.md` (copy of this plan, once it exists in the paykit repo's own history)

**Interfaces:**

- Produces: none (docs only). Read by every later task's implementer.

- [ ] **Step 1: `AGENTS.md`** — same structure/rules as `qkit/AGENTS.md` and `loopkit/AGENTS.md`, adapted to paykit's own stack/data model/rules:

```markdown
<!-- templateCentral: nextjs (Supabase variant — shared project, schema per kit) -->

# AGENTS.md — paykit

> STOP — This project diverges from the stock templateCentral Next.js stack on
> the data layer only. Auth/DB/realtime are **Supabase** (`@supabase/ssr`), not
> better-auth + Drizzle. Authorization is enforced in Postgres via **RLS**, not
> an app repository layer. Runtime matches tc: Next 16, route protection in
> `src/proxy.ts`, and `cookies()`/`headers()`/`params`/`searchParams` are async.

## What paykit is

The Merqo family's shared PayNow payment engine. A standalone kit; owns the
`paykit` schema in the shared Supabase project; any other kit requests a
PayNow QR + tracks payment status over paykit's bearer-secret HTTP API
(`/api/v1/*`). paykit never touches funds — it renders a QR the customer
scans in their own bank app and tracks a status a human confirms. No other
kit calls paykit yet in this scope; qkit's own local payment code
(`booths.payment`, `claimPayment`/`confirmPayment`) is untouched and stays
that way until a later, separate cutover spec.

## Stack

Next.js 16 · App Router · Turbopack · TypeScript strict · Tailwind v4 · shadcn/ui
(new-york) · Zod · Supabase (`@supabase/ssr`) · Vitest · pnpm 11 · Node ≥24 ·
deploy target: Vercel

## Commands

\`\`\`bash
pnpm dev # dev server — http://localhost:3000
pnpm build # production build
pnpm test # run test suite (vitest)
pnpm test:mutation # stryker mutation testing (scoped to src/lib; advisory)
pnpm check # prettier --check + eslint + tsc --noEmit
pnpm format # prettier --write
\`\`\`

No `test:e2e` — this kit's testing surface (per its design spec) is Unit
(mutation-tested `src/lib`), a Contract test on the HTTP API surface, RLS
(pgTAP), and DOM. No Playwright suite exists.

## File Layout

\`\`\`
src/app/ — app router (dashboard, login, API routes)
src/app/api/v1/checkout/ — POST /api/v1/checkout, GET/POST /api/v1/checkout/{id}[/claim|/confirm]
src/app/api/v1/vendors/ — GET /api/v1/vendors/{vendor_id}/config
src/app/dashboard/ — vendor dashboard (config, transactions, reports)
src/proxy.ts — Supabase session refresh + /dashboard guard (Next 16)
src/lib/supabase/ — browser / server / service clients + mw helper (schema=paykit)
src/lib/payments/paynow.ts — EMVCo PayNow QR builder (ported verbatim from qkit)
src/lib/payments/adapter.ts — PaymentAdapter (paynow) + reserved-but-dark auto-verify stub
src/lib/tx-state.ts — pure pending→claimed→confirmed transition logic
src/lib/kit-auth.ts — bearer-secret verification for calling kits
src/lib/schemas.ts — Zod: vendor PayNow config write schema
src/lib/api-schemas.ts — Zod: HTTP API request/response contracts
src/lib/types.ts — DB types (mirror of supabase/migrations)
scripts/create-kit-key.mjs — mint + store a hashed bearer secret for a calling kit
supabase/migrations/ — SQL schema + RLS + grants
supabase/tests/rls.test.sql — pgTAP RLS suite
test/contract/ — HTTP API contract test (mirrors merqo's qkit-metrics precedent)
\`\`\`

## Data model

- `vendor_payment_config` (PK `vendor_id`): one PayNow config per vendor,
  reused across every kit/booth/store that vendor runs. Exactly one of
  `uen`/`mobile`. `plan` (`free`|`pro`) gates the 100 tx/mo cap and Pro
  features (reports, refunds) — this column is a minimal addition beyond the
  design spec's literal table listing, necessary to implement the very
  Pro-gate the same spec describes (see the plan's Self-Review).
  `verification_method` is schema-reserved (`'manual'` only is ever written).
- `transactions`: one row per checkout, `status` `pending`→`claimed`→`confirmed`,
  `kit_slug` records which kit created it, `qr_payload` stored at creation for
  replay/audit.
- `refunds` (Pro only): bookkeeping ledger row against a `confirmed`
  transaction — no real money movement.
- `kit_api_keys`: one hashed bearer secret per calling kit, service-role only
  (no RLS policy grants any access to `authenticated`/`anon`).
- RLS: a vendor reads/writes only their own `vendor_payment_config`; reads
  (not writes) only their own `transactions`; reads/inserts `refunds` only for
  their own confirmed transactions while on Pro. The cross-kit API
  (`/checkout`, `/claim`, `/confirm`) is service-role + bearer-secret,
  server-only.

## Rules (always)

- TypeScript strict — no `any`, no `@ts-ignore`.
- Validate all user input with Zod at every boundary (forms + server actions + API routes).
- Authorization lives in **RLS policies**, not in app code. Never widen a policy
  to "fix" a query — fix the query or the session instead.
- Use the **service-role client only** in Server Actions / Route Handlers, never
  in client components. It bypasses RLS.
- No secrets in `NEXT_PUBLIC_*`. `NEXT_PUBLIC_SUPABASE_*` are inlined at build —
  rebuild after changing them.
- `@supabase/ssr` and `@supabase/supabase-js` versions must stay compatible
  (currently ssr 0.10.x ↔ supabase-js 2.48.x — check package.json, not this
  number) or every query degrades to `never`.
- Every `/api/v1/*` route verifies the caller's bearer secret via
  `verifyKitAuth` before touching the database — never trust an unauthenticated
  `vendor_id` in a request body.
- paykit never touches funds. Do not add a payment-provider SDK, a webhook
  that moves money, or a real auto-verify integration.
- After editing the schema, update both `supabase/migrations/` and
  `src/lib/types.ts`.

## Skills

### Project skills — check here first (`.claude/skills/`)

| Skill               | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `/next-verify`      | typecheck + lint + test in one pass                          |
| `/supabase-migrate` | apply `supabase/migrations` + regenerate types (safety gate) |

### templateCentral plugin skills

templateCentral has **no Supabase support** (auth=better-auth, db=Drizzle/Kysely/Mongoose,
no realtime). Use only the stack-agnostic ones here:

| Skill                       | When to use                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| `templatecentral:standards` | naming/validation/drift-check (expect Supabase-vs-tc drift findings) |

Do **not** run `templatecentral:add (auth)` or `(database)` — they install
better-auth / Drizzle and will break RLS.

## AI Harness

PreToolUse: blocks secret files (exit 2): `.env*` (except `.env.example`),
cert files (`.pem`/`.key`/`.p12`/`.pfx`/`.secret`), `credentials.json`/`.netrc`/`.secrets`;
and blocks `--no-verify`. App code, skills, specs, and `.github/workflows/`
unrestricted.
UserPromptSubmit: pattern-checks prompts for injection phrases; exit 2 blocks.
PostToolUse: `tsc --noEmit --incremental` after every Edit/Write. Feedback-only.
Stop: exits 0 when `stop_hook_active` (no re-entry loop); else runs the test
suite, exit 2 feeds failures back, exit 0 on pass.
SessionStart (startup|resume|compact): re-injects first 30 lines of this file.
`permissions`: max-privilege — bare-tool `allow` (Bash/Read/Edit/Write/web/Skill/
Task) so common work doesn't prompt; `deny` covers secret reads/edits (`.env.local`
and other `.env.<env>` variants, `./secrets/**` — `.env.example` is the one
whitelisted env file) and irreversible ops (`rm -rf`, `git push --force`/`-f`,
`git reset --hard`, `git clean -fd/-fx`, `git filter-branch`, ref-delete). Deny
always wins (enforced even under bypass); it's a guardrail, not a sandbox.
RLS isolation: `supabase/tests/rls.test.sql` via `supabase test db`.
Project skills (directory form, `<name>/SKILL.md`): `.claude/skills/` |
Manifest: `.claude/harness.json`

## Skills Security

- Review `SKILL.md` before installing any third-party skill — treat skills like packages.
- Scope `allowed-tools:` to the minimum (e.g. `Bash(git *)` not `Bash`).
- Never install skills that hardcode secrets or make unlisted outbound calls.

## Project-Specific Notes

- This repo is a fresh harness seeded from the sibling project `qkit` (same
  templateCentral Supabase variant, same shared Supabase project, different
  schema) — same seeding precedent loopkit used. The EMVCo PayNow QR builder
  (`src/lib/payments/paynow.ts`) is ported **verbatim** from qkit; it originated
  in qkit's own
  `docs/superpowers/specs/2026-06-28-qkit-payments-seam-design.md`.
- Design: `docs/superpowers/specs/2026-07-15-paykit-mvp-design.md`. Plan of
  record: `docs/superpowers/plans/2026-07-15-paykit-mvp.md`.
- Cutting qkit (or any other kit) over to actually call paykit is a separate,
  later spec — not started here.
```

- [ ] **Step 2: `CLAUDE.md`:**

```markdown
@AGENTS.md
```

- [ ] **Step 3: `README.md`:**

```markdown
# paykit

The Merqo family's shared PayNow payment engine. A vendor sets up their
PayNow config once here; any Merqo kit can then request a QR + track payment
status for that vendor over paykit's HTTP API. paykit never touches funds —
it renders a QR the customer scans in their own bank app, and a human
confirms receipt.

See `AGENTS.md` for stack, commands, data model, and rules. See
`docs/superpowers/specs/2026-07-15-paykit-mvp-design.md` for the approved
design and `docs/superpowers/plans/2026-07-15-paykit-mvp.md` for the
implementation plan.
```

- [ ] **Step 4: copy the design spec and this plan into the repo** (`docs/superpowers/{specs,plans}/`), matching the sibling repos' own-copy convention:

```bash
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp "../docs/superpowers/specs/2026-07-15-paykit-mvp-design.md" docs/superpowers/specs/
cp "../docs/superpowers/plans/2026-07-15-paykit-mvp.md" docs/superpowers/plans/
```

- [ ] **Step 5: verify + commit.**

```bash
pnpm check
git add AGENTS.md CLAUDE.md README.md docs
git commit -m "docs: paykit AGENTS.md/CLAUDE.md harness + design spec/plan copies"
git push
```

---

### Task 3: Supabase clients + proxy guard (ported from qkit, schema=paykit)

**Files:**

- Create: `src/lib/env.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/proxy.ts`
- Create: `src/lib/types.ts` (stub — extended by Task 4)

**Interfaces:**

- Produces: `publicEnv` (`{ supabaseUrl, supabasePublishableKey }`), `createClient()` (browser), `createServerClient()` (cookie-bound, schema `paykit`), `createServiceClient()` (secret key, schema `paykit`, RLS-bypassing), `updateSession(request)` (proxy helper), `type Database` (schema key `paykit`).

- [ ] **Step 1: `src/lib/env.ts`** (identical to qkit's — client-safe, fail-fast on a missing var):

```ts
function req(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const publicEnv = {
  supabaseUrl: req(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabasePublishableKey: req(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
} as const;
```

- [ ] **Step 2: `src/lib/types.ts` stub** (extended with real table shapes in Task 4; created now so the clients below can reference `Database`):

```ts
export interface Database {
  paykit: {
    Tables: Record<string, never>;
  };
}
```

- [ ] **Step 3: `src/lib/supabase/client.ts`:**

```ts
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/types";

export function createClient() {
  return createBrowserClient<Database, "paykit">(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    { db: { schema: "paykit" } },
  );
}
```

- [ ] **Step 4: `src/lib/supabase/server.ts`:**

```ts
import {
  createServerClient as createSSRClient,
  type CookieMethodsServer,
} from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/types";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function cookieMethods(cookieStore: CookieStore): CookieMethodsServer {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // Read-only context (Server Component) — session refresh handled by middleware
      }
    },
  };
}

export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRClient<Database, "paykit">(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      cookies: cookieMethods(cookieStore),
      db: { schema: "paykit" },
    },
  );
}

// Uses the secret key — bypasses RLS. Only use in Server Actions/Route
// Handlers. No request cookies are attached: an empty cookie adapter means
// the secret key drives auth, giving a true RLS bypass instead of silently
// authenticating as whatever user's cookies happened to be present.
export async function createServiceClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey)
    throw new Error(
      "Missing required environment variable: SUPABASE_SECRET_KEY",
    );
  return createSSRClient<Database, "paykit">(publicEnv.supabaseUrl, secretKey, {
    cookies: { getAll: () => [], setAll: () => {} },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: { schema: "paykit" },
  });
}
```

- [ ] **Step 5: `src/lib/supabase/middleware.ts`** (only `/dashboard` needs a session — the HTTP API is bearer-guarded separately, and there's no public/anonymous customer surface in paykit):

```ts
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/types";

function isProtectedPath(path: string): boolean {
  return path.startsWith("/dashboard");
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database, "paykit">(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
      db: { schema: "paykit" },
    },
  );

  if (!isProtectedPath(request.nextUrl.pathname)) return supabaseResponse;

  let user: User | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 6: `src/proxy.ts`:**

```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 7: verify.**

```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=x pnpm check
```

Expected: passes (no runtime Supabase call happens at typecheck/lint time).

- [ ] **Step 8: commit.**

```bash
git add src/lib/env.ts src/lib/types.ts src/lib/supabase src/proxy.ts
git commit -m "feat: supabase clients + proxy guard (schema=paykit)"
```

---

### Task 4: Database migration — paykit schema, RLS, grants

**Files:**

- Create: `supabase/migrations/0001_paykit_core.sql`
- Create: `test/db/schema.test.ts`
- Modify: `src/lib/types.ts` (replace the Task 3 stub with real table shapes)

**Interfaces:**

- Produces (Postgres): tables `paykit.vendor_payment_config`, `paykit.transactions`, `paykit.refunds`, `paykit.kit_api_keys`; function `paykit.tx_count_this_month(uuid) → int`.
- Produces (TS): `type TxStatus = "pending" | "claimed" | "confirmed"`, `type VendorPlan = "free" | "pro"`, `type VendorPaymentConfig`, `type Transaction`, `type Refund`, extended `Database["paykit"]["Tables"]`.

**Note on scope:** the design spec's Data model section lists `vendor_payment_config`'s columns without a `plan` field, but the same spec's "Vendor-facing paykit app" and "Freemium gates by scale" sections require gating the 100 tx/mo cap and Pro features (reports, refunds) by vendor plan. A `plan` column on `vendor_payment_config` is the minimal, spec-consistent addition needed to implement that explicit requirement (same shape as qkit's `vendors.plan`) — every other column matches the spec verbatim. This is called out again in the plan's Self-Review.

- [ ] **Step 1: write the failing schema-guard test** `test/db/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sql = readFileSync(
  fileURLToPath(
    new URL("../../supabase/migrations/0001_paykit_core.sql", import.meta.url),
  ),
  "utf8",
);

describe("0001_paykit_core.sql", () => {
  it("creates the paykit schema", () => {
    expect(sql).toMatch(/create schema if not exists paykit/);
  });

  it.each(["vendor_payment_config", "transactions", "refunds", "kit_api_keys"])(
    "creates table paykit.%s",
    (table) => {
      expect(sql).toMatch(new RegExp(`create table paykit\\.${table}`));
    },
  );

  it.each(["vendor_payment_config", "transactions", "refunds", "kit_api_keys"])(
    "enables RLS on paykit.%s",
    (table) => {
      expect(sql).toMatch(
        new RegExp(`alter table paykit\\.${table} enable row level security`),
      );
    },
  );

  it("defines tx_count_this_month", () => {
    expect(sql).toMatch(/function paykit\.tx_count_this_month/);
  });

  it("never grants kit_api_keys to authenticated or anon", () => {
    expect(sql).not.toMatch(
      /grant[^;]*kit_api_keys[^;]*to (authenticated|anon)/i,
    );
  });
});
```

- [ ] **Step 2: run — fails** (the migration file doesn't exist yet).

```bash
pnpm test -- test/db/schema.test.ts
```

Expected: FAIL — `ENOENT` reading `0001_paykit_core.sql`.

- [ ] **Step 3: write the migration** `supabase/migrations/0001_paykit_core.sql`:

```sql
create schema if not exists paykit;

create table paykit.vendor_payment_config (
  vendor_id           uuid primary key references auth.users(id) on delete cascade,
  uen                 text,
  mobile              text,
  payee_name          text not null,
  verification_method text not null default 'manual' check (verification_method in ('manual', 'auto')),
  plan                text not null default 'free' check (plan in ('free', 'pro')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint vendor_payment_config_one_proxy check (
    (uen is not null and mobile is null) or (uen is null and mobile is not null)
  )
);

create table paykit.transactions (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references auth.users(id) on delete cascade,
  kit_slug     text not null,
  order_ref    text not null,
  amount_cents integer not null check (amount_cents > 0),
  status       text not null default 'pending' check (status in ('pending', 'claimed', 'confirmed')),
  qr_payload   text not null,
  claimed_at   timestamptz,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now()
);
create index transactions_vendor_idx on paykit.transactions (vendor_id, created_at desc);
create index transactions_vendor_kit_idx on paykit.transactions (vendor_id, kit_slug);

create table paykit.refunds (
  id                    uuid primary key default gen_random_uuid(),
  transaction_id        uuid not null references paykit.transactions(id) on delete cascade,
  refunded_amount_cents integer not null check (refunded_amount_cents > 0),
  reason                text,
  created_by            uuid not null references auth.users(id),
  created_at            timestamptz not null default now()
);
create index refunds_transaction_idx on paykit.refunds (transaction_id);

create table paykit.kit_api_keys (
  kit_slug    text primary key,
  secret_hash text not null,
  created_at  timestamptz not null default now()
);

-- updated_at bookkeeping
create or replace function paykit.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger vendor_payment_config_set_updated_at
before update on paykit.vendor_payment_config
for each row execute function paykit.set_updated_at();

-- Free-tier usage: caller-scoped so an authenticated vendor can only ever
-- count their own transactions (SECURITY DEFINER would otherwise leak
-- another vendor's monthly count). service_role (no auth.uid()) is
-- unrestricted — the checkout API's own count query goes through the
-- service client directly, but the vendor dashboard's usage meter calls
-- this RPC as the signed-in vendor.
create or replace function paykit.tx_count_this_month(p_vendor uuid)
returns integer language plpgsql security definer stable set search_path = '' as $$
begin
  if auth.uid() is not null and auth.uid() <> p_vendor then
    raise exception 'not authorized';
  end if;
  return (
    select count(*)::int from paykit.transactions
    where vendor_id = p_vendor
      and created_at >= date_trunc('month', now())
  );
end;
$$;

-- RLS
alter table paykit.vendor_payment_config enable row level security;
alter table paykit.transactions enable row level security;
alter table paykit.refunds enable row level security;
alter table paykit.kit_api_keys enable row level security;

create policy vendor_payment_config_own on paykit.vendor_payment_config
  for all
  using (vendor_id = (select auth.uid()))
  with check (vendor_id = (select auth.uid()));

create policy transactions_select_own on paykit.transactions
  for select
  using (vendor_id = (select auth.uid()));

create policy refunds_select_own on paykit.refunds
  for select
  using (
    exists (
      select 1 from paykit.transactions t
      where t.id = transaction_id and t.vendor_id = (select auth.uid())
    )
  );

-- A refund may only be filed by the owning vendor, against their own
-- CONFIRMED transaction, while on Pro (refunds are a Pro-only bookkeeping
-- feature per the design spec).
create policy refunds_insert_own on paykit.refunds
  for insert
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from paykit.transactions t
      join paykit.vendor_payment_config c on c.vendor_id = t.vendor_id
      where t.id = transaction_id
        and t.vendor_id = (select auth.uid())
        and t.status = 'confirmed'
        and c.plan = 'pro'
    )
  );

-- kit_api_keys carries NO policy at all: only service_role (which bypasses
-- RLS) may ever touch it. No grants below give authenticated/anon any access.

grant usage on schema paykit to anon, authenticated, service_role;
grant select, insert, update, delete on paykit.vendor_payment_config to authenticated;
grant select on paykit.transactions to authenticated;
grant select, insert on paykit.refunds to authenticated;
grant all on all tables in schema paykit to service_role;
grant execute on function paykit.tx_count_this_month(uuid) to authenticated, service_role;
```

- [ ] **Step 4: run — passes.**

```bash
pnpm test -- test/db/schema.test.ts
```

Expected: PASS, 11 tests (4 + 4 from the two `it.each` blocks, plus 3 single tests).

- [ ] **Step 5: extend `src/lib/types.ts`** (replaces the Task 3 stub):

```ts
export type TxStatus = "pending" | "claimed" | "confirmed";
export type VendorPlan = "free" | "pro";
export type VerificationMethod = "manual" | "auto";

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

export type Transaction = {
  id: string;
  vendor_id: string;
  kit_slug: string;
  order_ref: string;
  amount_cents: number;
  status: TxStatus;
  qr_payload: string;
  claimed_at: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export type Refund = {
  id: string;
  transaction_id: string;
  refunded_amount_cents: number;
  reason: string | null;
  created_by: string;
  created_at: string;
};

export interface Database {
  paykit: {
    Tables: {
      vendor_payment_config: {
        Row: VendorPaymentConfig;
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
      };
      transactions: {
        Row: Transaction;
        Insert: {
          id?: string;
          vendor_id: string;
          kit_slug: string;
          order_ref: string;
          amount_cents: number;
          status?: TxStatus;
          qr_payload: string;
          claimed_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
        };
        Update: {
          status?: TxStatus;
          claimed_at?: string | null;
          confirmed_at?: string | null;
        };
      };
      refunds: {
        Row: Refund;
        Insert: {
          id?: string;
          transaction_id: string;
          refunded_amount_cents: number;
          reason?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          reason?: string | null;
        };
      };
      kit_api_keys: {
        Row: { kit_slug: string; secret_hash: string; created_at: string };
        Insert: { kit_slug: string; secret_hash: string; created_at?: string };
        Update: { secret_hash?: string };
      };
    };
  };
}
```

- [ ] **Step 6: verify + commit.**

```bash
pnpm check
git add supabase/migrations/0001_paykit_core.sql test/db/schema.test.ts src/lib/types.ts
git commit -m "feat: paykit schema — vendor_payment_config, transactions, refunds, kit_api_keys + RLS"
```

---

### Task 5: EMVCo PayNow adapter — port verbatim + PaymentAdapter

**Files:**

- Create: `src/lib/payments/paynow.ts` (verbatim port from `qkit/src/lib/payments/paynow.ts`)
- Create: `src/lib/payments/paynow.test.ts` (verbatim port from `qkit/src/lib/payments/paynow.test.ts`)
- Create: `src/lib/payments/adapter.ts`, `src/lib/payments/adapter.test.ts`

**Interfaces:**

- Consumes: `VendorPaymentConfig` (Task 4).
- Produces: `buildPayNowPayload(args): string`, `crc16(s): number`, `interface PaymentAdapter { kind: "paynow"; renderCheckout(config, ctx): { type: "qr"; payload: string } }`, `paynowAdapter: PaymentAdapter`, `autoVerify(): never`.

This is a directed **port of already-tested, pure code** — per the design spec it moves unchanged, so the cycle here is port-then-verify rather than write-red-first.

- [ ] **Step 1: port `src/lib/payments/paynow.ts`** — byte-for-byte from `qkit/src/lib/payments/paynow.ts`:

```ts
// EMVCo-compliant PayNow QR payload builder. Pure — no I/O. paykit never
// touches funds; this only renders a QR the customer scans in their own bank
// app.

/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over the UTF-8 bytes of `s`.
 * Byte semantics (not charCodeAt) so a multibyte payee name produces the same
 * CRC a scanner computes over the QR's byte stream. ASCII is unaffected.
 */
export function crc16(s: string): number {
  const bytes = new TextEncoder().encode(s);
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc;
}

/**
 * One EMVCo TLV field: 2-char id + 2-char zero-padded length + value. The
 * length counts UTF-8 BYTES (not UTF-16 code units), so a multibyte payee name
 * (e.g. a CJK stall name) declares the length the banking app actually parses.
 */
function tlv(id: string, value: string): string {
  const byteLen = new TextEncoder().encode(value).length;
  return id + byteLen.toString().padStart(2, "0") + value;
}

export function buildPayNowPayload(args: {
  uen?: string;
  mobile?: string;
  payeeName: string;
  amountCents: number;
  reference: string;
}): string {
  const isUen = Boolean(args.uen);
  const proxyType = isUen ? "2" : "0";
  const proxyValue = (args.uen ?? args.mobile ?? "").trim();

  // Merchant account information template (ID 26) for PayNow. Amount is fixed
  // (editable flag "0") — every QR is a single-use, per-order dynamic code.
  const merchant = tlv(
    "26",
    tlv("00", "SG.PAYNOW") +
      tlv("01", proxyType) +
      tlv("02", proxyValue) +
      tlv("03", "0"),
  );

  const amount = (args.amountCents / 100).toFixed(2);

  const body =
    // payload format indicator
    tlv("00", "01") +
    // dynamic QR (single use)
    tlv("01", "12") +
    merchant +
    // merchant category code (unset)
    tlv("52", "0000") +
    // currency: SGD (ISO 4217 numeric)
    tlv("53", "702") +
    tlv("54", amount) +
    // country
    tlv("58", "SG") +
    // merchant name
    tlv("59", args.payeeName.slice(0, 25)) +
    // merchant city
    tlv("60", "Singapore") +
    // additional data: bill ref
    tlv("62", tlv("01", args.reference.slice(0, 25)));

  // CRC is computed over the body plus the CRC tag+length ("6304").
  const withCrcTag = body + "6304";
  const crc = crc16(withCrcTag).toString(16).toUpperCase().padStart(4, "0");
  return withCrcTag + crc;
}
```

- [ ] **Step 2: port `src/lib/payments/paynow.test.ts`** — byte-for-byte from `qkit/src/lib/payments/paynow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPayNowPayload, crc16 } from "./paynow";

describe("crc16 (CRC-16/CCITT-FALSE)", () => {
  it("matches the known check value for '123456789'", () => {
    // CRC-16/CCITT-FALSE check value is 0x29B1.
    expect(crc16("123456789")).toBe(0x29b1);
  });
});

describe("buildPayNowPayload", () => {
  it("emits a UEN payload that ends with a 4-hex CRC and contains SG.PAYNOW", () => {
    const s = buildPayNowPayload({
      uen: "53312345A",
      payeeName: "Kopitiam Cart",
      amountCents: 450,
      reference: "12",
    });
    expect(s).toContain("SG.PAYNOW");
    expect(s).toContain("53312345A");
    // Amount field 54 = "4.50".
    expect(s).toContain("54044.50");
    // Ends with CRC tag 6304 + 4 hex chars.
    expect(s).toMatch(/6304[0-9A-F]{4}$/);
  });

  it("uses proxy type 0 for mobile, 2 for UEN", () => {
    expect(
      buildPayNowPayload({
        mobile: "+6591234567",
        payeeName: "x",
        amountCents: 100,
        reference: "1",
      }),
    ).toContain("SG.PAYNOW0101" + "0");
    expect(
      buildPayNowPayload({
        uen: "53312345A",
        payeeName: "x",
        amountCents: 100,
        reference: "1",
      }),
    ).toContain("SG.PAYNOW0101" + "2");
  });

  it("declares EMVCo lengths in UTF-8 bytes for a non-ASCII payee", () => {
    const s = buildPayNowPayload({
      uen: "53312345A",
      payeeName: "珍珠",
      amountCents: 100,
      reference: "1",
    });
    expect(s).toContain("5906珍珠");
  });

  it("round-trips its own CRC (recomputing over the body matches the suffix)", () => {
    const s = buildPayNowPayload({
      uen: "53312345A",
      payeeName: "x",
      amountCents: 100,
      reference: "1",
    });
    const body = s.slice(0, -4);
    const expected = crc16(body).toString(16).toUpperCase().padStart(4, "0");
    expect(s.slice(-4)).toBe(expected);
  });
});
```

- [ ] **Step 3: run — passes immediately** (proven code, ported unchanged):

```bash
pnpm test -- src/lib/payments/paynow.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 4: write the failing test for the new adapter wrapper** `src/lib/payments/adapter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { paynowAdapter, autoVerify } from "./adapter";
import type { VendorPaymentConfig } from "@/lib/types";

const config: VendorPaymentConfig = {
  vendor_id: "11111111-1111-1111-1111-111111111111",
  uen: "53312345A",
  mobile: null,
  payee_name: "Kopitiam Cart",
  verification_method: "manual",
  plan: "free",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("paynowAdapter", () => {
  it("declares kind paynow", () => {
    expect(paynowAdapter.kind).toBe("paynow");
  });

  it("renders a QR checkout view from a UEN config", () => {
    const view = paynowAdapter.renderCheckout(config, {
      amountCents: 450,
      orderRef: "order-1",
    });
    expect(view.type).toBe("qr");
    expect(view.payload).toContain("SG.PAYNOW");
    expect(view.payload).toContain("53312345A");
  });

  it("renders a QR checkout view from a mobile config", () => {
    const view = paynowAdapter.renderCheckout(
      { ...config, uen: null, mobile: "+6591234567" },
      { amountCents: 100, orderRef: "order-2" },
    );
    expect(view.payload).toContain("+6591234567");
  });
});

describe("autoVerify", () => {
  it("throws — schema-reserved, not enabled in v1", () => {
    expect(() => autoVerify()).toThrow("auto-verify not enabled");
  });
});
```

- [ ] **Step 5: run — fails** (`./adapter` doesn't exist).

```bash
pnpm test -- src/lib/payments/adapter.test.ts
```

Expected: FAIL — cannot resolve `./adapter`.

- [ ] **Step 6: implement `src/lib/payments/adapter.ts`:**

```ts
import { buildPayNowPayload } from "./paynow";
import type { VendorPaymentConfig } from "@/lib/types";

export interface PaymentAdapter {
  kind: "paynow";
  renderCheckout(
    config: VendorPaymentConfig,
    ctx: { amountCents: number; orderRef: string },
  ): { type: "qr"; payload: string };
}

export const paynowAdapter: PaymentAdapter = {
  kind: "paynow",
  renderCheckout(config, ctx) {
    const payload = buildPayNowPayload({
      uen: config.uen ?? undefined,
      mobile: config.mobile ?? undefined,
      payeeName: config.payee_name,
      amountCents: ctx.amountCents,
      reference: ctx.orderRef,
    });
    return { type: "qr", payload };
  },
};

/**
 * verification_method: 'auto' is schema-reserved — the vendor config write
 * schema (Task 6) never lets a vendor select it, so this is never called in
 * v1. Same dark-adapter precedent as qkit's unbuilt Stripe slot: the shape
 * exists so a real bank-API integration later doesn't touch the checkout
 * flow, but nothing invokes it until that integration exists.
 */
export function autoVerify(): never {
  throw new Error("auto-verify not enabled");
}
```

- [ ] **Step 7: run — passes.**

```bash
pnpm test -- src/lib/payments/adapter.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 8: commit.**

```bash
git add src/lib/payments
git commit -m "feat: port EMVCo PayNow builder from qkit + PaymentAdapter wrapper"
```

---

### Task 6: Zod schemas — vendor config write schema + HTTP API contracts

**Files:**

- Create: `src/lib/schemas.ts`, `src/lib/schemas.test.ts`
- Create: `src/lib/api-schemas.ts`, `src/lib/api-schemas.test.ts`

**Interfaces:**

- Produces: `vendorPaymentConfigInputSchema` (+ `type VendorPaymentConfigInput`), `txStatusSchema`, `checkoutRequestSchema` (+ `type CheckoutRequest`), `checkoutResponseSchema` (+ `type CheckoutResponse`), `transactionStatusResponseSchema` (+ `type TransactionStatusResponse`), `vendorConfigResponseSchema` (+ `type VendorConfigResponse`), `errorResponseSchema`, `toStatusResponse(row): TransactionStatusResponse`.

- [ ] **Step 1: write the failing test** `src/lib/schemas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { vendorPaymentConfigInputSchema } from "./schemas";

describe("vendorPaymentConfigInputSchema", () => {
  it("accepts a valid UEN-only config", () => {
    const parsed = vendorPaymentConfigInputSchema.safeParse({
      payee_name: "Kopitiam Cart",
      uen: "53312345A",
      mobile: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a valid mobile-only config", () => {
    const parsed = vendorPaymentConfigInputSchema.safeParse({
      payee_name: "Kopitiam Cart",
      uen: "",
      mobile: "+6591234567",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects both uen and mobile set", () => {
    const parsed = vendorPaymentConfigInputSchema.safeParse({
      payee_name: "Kopitiam Cart",
      uen: "53312345A",
      mobile: "+6591234567",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects neither uen nor mobile set", () => {
    const parsed = vendorPaymentConfigInputSchema.safeParse({
      payee_name: "Kopitiam Cart",
      uen: "",
      mobile: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid UEN format", () => {
    const parsed = vendorPaymentConfigInputSchema.safeParse({
      payee_name: "Kopitiam Cart",
      uen: "!!!",
      mobile: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty payee name", () => {
    const parsed = vendorPaymentConfigInputSchema.safeParse({
      payee_name: "",
      uen: "53312345A",
      mobile: "",
    });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: run — fails** (`./schemas` doesn't exist).

- [ ] **Step 3: implement `src/lib/schemas.ts`** (mirrors qkit's `paynowConfigSchema` xor rule, adapted to paykit's flat table columns instead of a JSONB discriminated union):

```ts
import { z } from "zod";

export const vendorPaymentConfigInputSchema = z
  .object({
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
  })
  .transform((v) => ({
    payee_name: v.payee_name,
    uen: v.uen || undefined,
    mobile: v.mobile || undefined,
  }))
  .refine((v) => Boolean(v.uen) !== Boolean(v.mobile), {
    message: "Provide either a UEN or a mobile number, not both",
    path: ["uen"],
  });

export type VendorPaymentConfigInput = z.infer<
  typeof vendorPaymentConfigInputSchema
>;
```

- [ ] **Step 4: run — passes.**

- [ ] **Step 5: write the failing test for the API contract schemas** `src/lib/api-schemas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  checkoutRequestSchema,
  checkoutResponseSchema,
  transactionStatusResponseSchema,
  vendorConfigResponseSchema,
  toStatusResponse,
} from "./api-schemas";

describe("checkoutRequestSchema", () => {
  it("accepts a valid request", () => {
    const parsed = checkoutRequestSchema.safeParse({
      vendor_id: "11111111-1111-1111-1111-111111111111",
      amount_cents: 450,
      order_ref: "A-001",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-uuid vendor_id", () => {
    expect(
      checkoutRequestSchema.safeParse({
        vendor_id: "not-a-uuid",
        amount_cents: 450,
        order_ref: "A-001",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    expect(
      checkoutRequestSchema.safeParse({
        vendor_id: "11111111-1111-1111-1111-111111111111",
        amount_cents: 0,
        order_ref: "A-001",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty order_ref", () => {
    expect(
      checkoutRequestSchema.safeParse({
        vendor_id: "11111111-1111-1111-1111-111111111111",
        amount_cents: 450,
        order_ref: "",
      }).success,
    ).toBe(false);
  });
});

describe("checkoutResponseSchema / transactionStatusResponseSchema / vendorConfigResponseSchema", () => {
  it("accept well-formed payloads", () => {
    expect(
      checkoutResponseSchema.safeParse({
        transaction_id: "11111111-1111-1111-1111-111111111111",
        qr_payload: "00020101...6304ABCD",
      }).success,
    ).toBe(true);
    expect(
      transactionStatusResponseSchema.safeParse({
        transaction_id: "11111111-1111-1111-1111-111111111111",
        status: "pending",
        amount_cents: 450,
        order_ref: "A-001",
        kit_slug: "qkit",
        claimed_at: null,
        confirmed_at: null,
        created_at: "2026-07-15T00:00:00Z",
      }).success,
    ).toBe(true);
    expect(
      vendorConfigResponseSchema.safeParse({
        has_config: true,
        payee_name: "Kopitiam Cart",
      }).success,
    ).toBe(true);
  });
});

describe("toStatusResponse", () => {
  it("maps a DB row to the wire shape", () => {
    const mapped = toStatusResponse({
      id: "tx1",
      status: "claimed",
      amount_cents: 450,
      order_ref: "A-001",
      kit_slug: "qkit",
      claimed_at: "2026-07-15T00:00:00Z",
      confirmed_at: null,
      created_at: "2026-07-15T00:00:00Z",
    });
    expect(mapped).toEqual({
      transaction_id: "tx1",
      status: "claimed",
      amount_cents: 450,
      order_ref: "A-001",
      kit_slug: "qkit",
      claimed_at: "2026-07-15T00:00:00Z",
      confirmed_at: null,
      created_at: "2026-07-15T00:00:00Z",
    });
  });
});
```

- [ ] **Step 6: run — fails** (`./api-schemas` doesn't exist).

- [ ] **Step 7: implement `src/lib/api-schemas.ts`** (the single source of truth for the `/api/v1/*` wire contract — imported by every route in Tasks 10–12 and by the Task 16 contract test):

```ts
import { z } from "zod";

export const txStatusSchema = z.enum(["pending", "claimed", "confirmed"]);

export const checkoutRequestSchema = z.object({
  vendor_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  order_ref: z.string().trim().min(1).max(200),
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export const checkoutResponseSchema = z.object({
  transaction_id: z.string().uuid(),
  qr_payload: z.string().min(1),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

export const transactionStatusResponseSchema = z.object({
  transaction_id: z.string(),
  status: txStatusSchema,
  amount_cents: z.number().int().positive(),
  order_ref: z.string(),
  kit_slug: z.string(),
  claimed_at: z.string().nullable(),
  confirmed_at: z.string().nullable(),
  created_at: z.string(),
});
export type TransactionStatusResponse = z.infer<
  typeof transactionStatusResponseSchema
>;

export const vendorConfigResponseSchema = z.object({
  has_config: z.boolean(),
  payee_name: z.string().nullable(),
});
export type VendorConfigResponse = z.infer<typeof vendorConfigResponseSchema>;

export const errorResponseSchema = z.object({ error: z.string() });

type TransactionRow = {
  id: string;
  status: string;
  amount_cents: number;
  order_ref: string;
  kit_slug: string;
  claimed_at: string | null;
  confirmed_at: string | null;
  created_at: string;
};

/** Maps a `paykit.transactions` row to the `/api/v1/checkout/*` wire shape. */
export function toStatusResponse(
  row: TransactionRow,
): TransactionStatusResponse {
  return {
    transaction_id: row.id,
    status: row.status as TransactionStatusResponse["status"],
    amount_cents: row.amount_cents,
    order_ref: row.order_ref,
    kit_slug: row.kit_slug,
    claimed_at: row.claimed_at,
    confirmed_at: row.confirmed_at,
    created_at: row.created_at,
  };
}
```

- [ ] **Step 8: run — passes.**

```bash
pnpm test -- src/lib/schemas.test.ts src/lib/api-schemas.test.ts
```

Expected: PASS, 12 tests (6 in `schemas.test.ts` + 6 in `api-schemas.test.ts`).

- [ ] **Step 9: commit.**

```bash
git add src/lib/schemas.ts src/lib/schemas.test.ts src/lib/api-schemas.ts src/lib/api-schemas.test.ts
git commit -m "feat: vendor config write schema + HTTP API contract schemas"
```

---

### Task 7: Transaction state machine (pure, mutation-tested)

**Files:**

- Create: `src/lib/tx-state.ts`, `src/lib/tx-state.test.ts`

**Interfaces:**

- Produces: `type TxStatus` (re-exported from `@/lib/types`), `claimTransition(current: TxStatus): { status: TxStatus; changed: boolean }`, `confirmTransition(current: TxStatus): { status: TxStatus; changed: boolean }`.

- [ ] **Step 1: write the failing test** `src/lib/tx-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { claimTransition, confirmTransition } from "./tx-state";

describe("claimTransition", () => {
  it("pending -> claimed (changed)", () => {
    expect(claimTransition("pending")).toEqual({
      status: "claimed",
      changed: true,
    });
  });
  it("claimed -> claimed (idempotent, unchanged)", () => {
    expect(claimTransition("claimed")).toEqual({
      status: "claimed",
      changed: false,
    });
  });
  it("confirmed -> confirmed (idempotent, unchanged — cannot un-confirm)", () => {
    expect(claimTransition("confirmed")).toEqual({
      status: "confirmed",
      changed: false,
    });
  });
});

describe("confirmTransition", () => {
  it("pending -> confirmed (changed)", () => {
    expect(confirmTransition("pending")).toEqual({
      status: "confirmed",
      changed: true,
    });
  });
  it("claimed -> confirmed (changed)", () => {
    expect(confirmTransition("claimed")).toEqual({
      status: "confirmed",
      changed: true,
    });
  });
  it("confirmed -> confirmed (idempotent, unchanged)", () => {
    expect(confirmTransition("confirmed")).toEqual({
      status: "confirmed",
      changed: false,
    });
  });
});
```

- [ ] **Step 2: run — fails** (`./tx-state` doesn't exist).

- [ ] **Step 3: implement `src/lib/tx-state.ts`:**

```ts
import type { TxStatus } from "@/lib/types";

export type { TxStatus };

/** Customer tapped "I've paid". Idempotent: already claimed/confirmed is a no-op success, never reverts a confirmed payment. */
export function claimTransition(current: TxStatus): {
  status: TxStatus;
  changed: boolean;
} {
  if (current === "pending") return { status: "claimed", changed: true };
  return { status: current, changed: false };
}

/** Vendor confirmed receipt. Idempotent: already confirmed is a no-op success. */
export function confirmTransition(current: TxStatus): {
  status: TxStatus;
  changed: boolean;
} {
  if (current === "pending" || current === "claimed")
    return { status: "confirmed", changed: true };
  return { status: "confirmed", changed: false };
}
```

- [ ] **Step 4: run — passes.**

```bash
pnpm test -- src/lib/tx-state.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: commit.**

```bash
git add src/lib/tx-state.ts src/lib/tx-state.test.ts
git commit -m "feat: pure pending/claimed/confirmed transition logic"
```

---

### Task 8: Kit auth — bearer-secret verification + key-minting script

**Files:**

- Create: `src/lib/kit-auth.ts`, `src/lib/kit-auth.test.ts`
- Create: `scripts/create-kit-key.mjs`

**Interfaces:**

- Consumes: `createServiceClient` (Task 3), `Database["paykit"]["Tables"]["kit_api_keys"]` (Task 4).
- Produces: `hashApiKey(secret: string): string`, `verifyKitAuth(request: Request): Promise<{ kitSlug: string } | null>`.

Bearer token format is `Authorization: Bearer <kit_slug>:<secret>` — the calling kit's identity travels with the token itself (paykit needs to know _which_ kit is calling, not just that _some_ kit is), verified against a per-kit SHA-256 hash stored in `kit_api_keys`.

- [ ] **Step 1: write the failing test** `src/lib/kit-auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashApiKey } from "./kit-auth";

const { maybeSingleMock, createServiceClientMock } = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
  createServiceClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));

beforeEach(async () => {
  maybeSingleMock.mockReset();
  createServiceClientMock.mockReset().mockResolvedValue({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
    }),
  });
});

function req(authorization?: string) {
  return new Request("http://localhost/api/v1/checkout", {
    headers: authorization ? { authorization } : {},
  });
}

describe("hashApiKey", () => {
  it("is deterministic and hex-encoded", () => {
    const h = hashApiKey("s3cret");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey("s3cret")).toBe(h);
  });
  it("differs for different secrets", () => {
    expect(hashApiKey("a")).not.toBe(hashApiKey("b"));
  });
});

describe("verifyKitAuth", () => {
  it("returns null with no Authorization header", async () => {
    const { verifyKitAuth } = await import("./kit-auth");
    expect(await verifyKitAuth(req())).toBeNull();
  });

  it("returns null for a malformed bearer token (no kit_slug:secret split)", async () => {
    const { verifyKitAuth } = await import("./kit-auth");
    expect(await verifyKitAuth(req("Bearer justasecret"))).toBeNull();
  });

  it("returns null when the kit_slug is unknown", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { verifyKitAuth } = await import("./kit-auth");
    expect(await verifyKitAuth(req("Bearer qkit:s3cret"))).toBeNull();
  });

  it("returns null when the secret hash does not match", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { secret_hash: hashApiKey("different-secret") },
      error: null,
    });
    const { verifyKitAuth } = await import("./kit-auth");
    expect(await verifyKitAuth(req("Bearer qkit:s3cret"))).toBeNull();
  });

  it("returns the kit slug when the secret hash matches", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { secret_hash: hashApiKey("s3cret") },
      error: null,
    });
    const { verifyKitAuth } = await import("./kit-auth");
    expect(await verifyKitAuth(req("Bearer qkit:s3cret"))).toEqual({
      kitSlug: "qkit",
    });
  });
});
```

- [ ] **Step 2: run — fails** (`./kit-auth` doesn't exist).

- [ ] **Step 3: implement `src/lib/kit-auth.ts`** (constant-time hash compare, same precedent as qkit's `bearerOk`, extended to a per-kit DB-backed secret):

```ts
import { createHash, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export async function verifyKitAuth(
  request: Request,
): Promise<{ kitSlug: string } | null> {
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;

  const token = header.slice(prefix.length);
  const sep = token.indexOf(":");
  if (sep <= 0) return null;
  const kitSlug = token.slice(0, sep);
  const secret = token.slice(sep + 1);
  if (!kitSlug || !secret) return null;

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("kit_api_keys")
    .select("secret_hash")
    .eq("kit_slug", kitSlug)
    .maybeSingle();
  if (error || !data) return null;

  const provided = Buffer.from(hashApiKey(secret));
  const expected = Buffer.from(data.secret_hash);
  const ok =
    provided.length === expected.length && timingSafeEqual(provided, expected);
  return ok ? { kitSlug } : null;
}
```

- [ ] **Step 4: run — passes.**

```bash
pnpm test -- src/lib/kit-auth.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: key-minting script** `scripts/create-kit-key.mjs` (run once per calling kit, out-of-band — not invoked by the app itself; hashing logic intentionally mirrors `hashApiKey` above since this script runs outside the Next.js bundle):

```js
#!/usr/bin/env node
// Generates a bearer secret for a new calling kit and stores its SHA-256 hash
// in paykit.kit_api_keys via the service-role client. Run once per kit. Prints
// the plaintext secret ONCE — save it in the calling kit's own secret store;
// paykit never stores or displays it again.
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const kitSlug = process.argv[2];
if (!kitSlug) {
  console.error("Usage: node scripts/create-kit-key.mjs <kit_slug>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY first.");
  process.exit(1);
}

const secret = randomBytes(32).toString("hex");
const secretHash = createHash("sha256").update(secret, "utf8").digest("hex");

const supabase = createClient(url, secretKey, { db: { schema: "paykit" } });
const { error } = await supabase
  .from("kit_api_keys")
  .upsert(
    { kit_slug: kitSlug, secret_hash: secretHash },
    { onConflict: "kit_slug" },
  );

if (error) {
  console.error("Failed to store key:", error.message);
  process.exit(1);
}

console.log(`Bearer token for ${kitSlug} (save this now, shown once):`);
console.log(`${kitSlug}:${secret}`);
```

- [ ] **Step 6: verify + commit.**

```bash
pnpm check
git add src/lib/kit-auth.ts src/lib/kit-auth.test.ts scripts/create-kit-key.mjs
git commit -m "feat: bearer-secret cross-kit auth + key-minting script"
```

---

### Task 9: Vendor login (shared `auth.users`, lean — no RHF)

**Files:**

- Create: `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`

**Interfaces:**

- Consumes: `createClient` (Task 3, browser), `createServerClient` (Task 3, server).
- Produces: `/login` (email/password + Google OAuth sign-in/sign-up), `/auth/callback` (exchanges the OAuth/magic-link code for a session, redirects to `/dashboard`).

No new signup flow — a vendor uses the same shared `auth.users` session as their other kits, so this is the same login shape as merqo's, not qkit's `Ticket`-branded one (paykit has no visual identity pass yet, per Global Constraints).

- [ ] **Step 1: `src/app/auth/callback/route.ts`** (ported from qkit, same open-redirect guard):

```ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  const next = searchParams.get("next");
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";

  if (!code) return NextResponse.redirect(`${origin}/login?error=oauth`);

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=oauth`);

  return NextResponse.redirect(`${origin}${safeNext}`);
}
```

- [ ] **Step 2: `src/app/login/page.tsx`** (lean, merqo-style — controlled inputs, no React Hook Form):

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSignin = mode === "signin";

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setBusy(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">paykit</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your PayNow setup and transactions.
          </p>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="px-7 pt-9 pb-8">
            <h2 className="text-2xl font-semibold">
              {isSignin ? "Welcome back" : "Create your account"}
            </h2>

            <Button
              type="button"
              variant="outline"
              onClick={signInWithGoogle}
              disabled={busy}
              className="mt-7 h-12 w-full"
            >
              Continue with Google
            </Button>

            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                or with email
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete={isSignin ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && (
                <p
                  role="alert"
                  className="text-sm font-medium text-destructive"
                >
                  {error}
                </p>
              )}
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full"
                disabled={busy}
              >
                {busy
                  ? "Please wait…"
                  : isSignin
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </form>
          </div>

          <div className="border-t" />
          <p className="px-7 py-4 text-center text-sm text-muted-foreground">
            {isSignin ? "New to paykit? " : "Already have an account? "}
            <button
              type="button"
              className="font-semibold text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setMode(isSignin ? "signup" : "signin");
                setError(null);
              }}
            >
              {isSignin ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: verify.**

```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=x pnpm check
pnpm build
```

- [ ] **Step 4: commit.**

```bash
git add src/app/login src/app/auth
git commit -m "feat: vendor login — Google + email, shared auth.users session"
```

---

### Task 10: HTTP API — `POST /api/v1/checkout`

**Files:**

- Create: `src/lib/usage.ts`, `src/lib/usage.test.ts`
- Create: `src/app/api/v1/checkout/route.ts`, `src/app/api/v1/checkout/route.test.ts`

**Interfaces:**

- Consumes: `verifyKitAuth` (Task 8), `createServiceClient` (Task 3), `checkoutRequestSchema` (Task 6), `paynowAdapter` (Task 5).
- Produces: `freeTierExceeded(plan: VendorPlan, countThisMonth: number): boolean`, `POST` handler returning `CheckoutResponse` (200), or `{error}` at 400/401/422/402/503.

- [ ] **Step 1: write the failing test for the pure gate** `src/lib/usage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { freeTierExceeded } from "./usage";

describe("freeTierExceeded", () => {
  it("false for a free vendor under the cap", () => {
    expect(freeTierExceeded("free", 99)).toBe(false);
  });
  it("true for a free vendor at the cap", () => {
    expect(freeTierExceeded("free", 100)).toBe(true);
  });
  it("true for a free vendor over the cap", () => {
    expect(freeTierExceeded("free", 150)).toBe(true);
  });
  it("false for a pro vendor at any count", () => {
    expect(freeTierExceeded("pro", 100_000)).toBe(false);
  });
});
```

- [ ] **Step 2: run — fails** (`./usage` doesn't exist).

- [ ] **Step 3: implement `src/lib/usage.ts`:**

```ts
import type { VendorPlan } from "@/lib/types";

/** Free tier: 100 tx/mo per vendor, counted across every kit. */
export function freeTierExceeded(
  plan: VendorPlan,
  countThisMonth: number,
): boolean {
  return plan === "free" && countThisMonth >= 100;
}
```

- [ ] **Step 4: run — passes.**

```bash
pnpm test -- src/lib/usage.test.ts
```

- [ ] **Step 5: write the failing route test** `src/app/api/v1/checkout/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

const {
  verifyKitAuthMock,
  configMaybeSingle,
  countHead,
  insertSingle,
  createServiceClientMock,
} = vi.hoisted(() => ({
  verifyKitAuthMock: vi.fn(),
  configMaybeSingle: vi.fn(),
  countHead: vi.fn(),
  insertSingle: vi.fn(),
  createServiceClientMock: vi.fn(),
}));

vi.mock("@/lib/kit-auth", () => ({ verifyKitAuth: verifyKitAuthMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));

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
          select: () => ({ eq: () => ({ gte: countHead }) }),
          insert: () => ({ select: () => ({ single: insertSingle }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  verifyKitAuthMock.mockReset().mockResolvedValue({ kitSlug: "qkit" });
  createServiceClientMock.mockReset().mockResolvedValue(fakeSupabase());
  configMaybeSingle.mockReset().mockResolvedValue({
    data: {
      vendor_id: "v1",
      uen: "53312345A",
      mobile: null,
      payee_name: "Kopitiam Cart",
      verification_method: "manual",
      plan: "free",
    },
    error: null,
  });
  countHead.mockReset().mockResolvedValue({ count: 3, error: null });
  insertSingle.mockReset().mockResolvedValue({
    data: { id: "tx1", qr_payload: "0002...6304ABCD" },
    error: null,
  });
});

function req(body: unknown, authorization = "Bearer qkit:secret") {
  return new Request("http://localhost/api/v1/checkout", {
    method: "POST",
    headers: { authorization },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/checkout", () => {
  it("creates a checkout and returns a QR payload", async () => {
    const res = await POST(
      req({ vendor_id: "v1", amount_cents: 450, order_ref: "A-001" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      transaction_id: "tx1",
      qr_payload: "0002...6304ABCD",
    });
  });

  it("401s when the bearer token is missing/invalid", async () => {
    verifyKitAuthMock.mockResolvedValue(null);
    const res = await POST(
      req({ vendor_id: "v1", amount_cents: 450, order_ref: "A-001" }),
    );
    expect(res.status).toBe(401);
  });

  it("422s when the vendor has no PayNow config", async () => {
    configMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await POST(
      req({ vendor_id: "v1", amount_cents: 450, order_ref: "A-001" }),
    );
    expect(res.status).toBe(422);
  });

  it("402s when a free-tier vendor is at the 100/mo cap", async () => {
    countHead.mockResolvedValue({ count: 100, error: null });
    const res = await POST(
      req({ vendor_id: "v1", amount_cents: 450, order_ref: "A-001" }),
    );
    expect(res.status).toBe(402);
  });

  it("400s on an invalid request body", async () => {
    const res = await POST(
      req({ vendor_id: "not-a-uuid", amount_cents: -1, order_ref: "" }),
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: run — fails** (`./route` doesn't exist).

- [ ] **Step 7: implement `src/app/api/v1/checkout/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyKitAuth } from "@/lib/kit-auth";
import { checkoutRequestSchema } from "@/lib/api-schemas";
import { paynowAdapter } from "@/lib/payments/adapter";
import { freeTierExceeded } from "@/lib/usage";
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

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const { count, error: countError } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendor_id)
    .gte("created_at", startOfMonth.toISOString());
  if (countError) {
    console.error("checkout: count read failed", countError.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  if (freeTierExceeded(config.plan, count ?? 0)) {
    return NextResponse.json(
      { error: "Free tier limit reached (100 tx/mo). Upgrade to Pro." },
      { status: 402 },
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

- [ ] **Step 8: run — passes.**

```bash
pnpm test -- src/app/api/v1/checkout/route.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 9: verify + commit.**

```bash
pnpm check
git add src/lib/usage.ts src/lib/usage.test.ts src/app/api/v1/checkout/route.ts src/app/api/v1/checkout/route.test.ts
git commit -m "feat: POST /api/v1/checkout"
```

---

### Task 11: HTTP API — claim + confirm

**Files:**

- Create: `src/app/api/v1/checkout/[id]/claim/route.ts`, `src/app/api/v1/checkout/[id]/claim/route.test.ts`
- Create: `src/app/api/v1/checkout/[id]/confirm/route.ts`, `src/app/api/v1/checkout/[id]/confirm/route.test.ts`

**Interfaces:**

- Consumes: `verifyKitAuth` (Task 8), `createServiceClient` (Task 3), `claimTransition`/`confirmTransition` (Task 7), `toStatusResponse` (Task 6).
- Produces: both routes return a `TransactionStatusResponse` (200) or `{error}` at 401/404/503.

- [ ] **Step 1: write the failing test** `src/app/api/v1/checkout/[id]/claim/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

const {
  verifyKitAuthMock,
  readMaybeSingle,
  updateSingle,
  createServiceClientMock,
} = vi.hoisted(() => ({
  verifyKitAuthMock: vi.fn(),
  readMaybeSingle: vi.fn(),
  updateSingle: vi.fn(),
  createServiceClientMock: vi.fn(),
}));

vi.mock("@/lib/kit-auth", () => ({ verifyKitAuth: verifyKitAuthMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));

const ROW = {
  id: "tx1",
  status: "pending",
  amount_cents: 450,
  order_ref: "A-001",
  kit_slug: "qkit",
  claimed_at: null,
  confirmed_at: null,
  created_at: "2026-07-15T00:00:00Z",
};

function fakeSupabase() {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: readMaybeSingle }) }),
      update: () => ({
        eq: () => ({
          eq: () => ({ select: () => ({ single: updateSingle }) }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  verifyKitAuthMock.mockReset().mockResolvedValue({ kitSlug: "qkit" });
  createServiceClientMock.mockReset().mockResolvedValue(fakeSupabase());
  readMaybeSingle.mockReset().mockResolvedValue({ data: ROW, error: null });
  updateSingle.mockReset().mockResolvedValue({
    data: { ...ROW, status: "claimed", claimed_at: "2026-07-15T00:01:00Z" },
    error: null,
  });
});

function req() {
  return new Request("http://localhost/api/v1/checkout/tx1/claim", {
    method: "POST",
    headers: { authorization: "Bearer qkit:secret" },
  });
}
function ctx() {
  return { params: Promise.resolve({ id: "tx1" }) };
}

describe("POST /api/v1/checkout/[id]/claim", () => {
  it("claims a pending transaction", async () => {
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("claimed");
    expect(json.claimed_at).toBe("2026-07-15T00:01:00Z");
  });

  it("is idempotent on an already-claimed transaction (no update call)", async () => {
    readMaybeSingle.mockResolvedValue({
      data: { ...ROW, status: "claimed" },
      error: null,
    });
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(updateSingle).not.toHaveBeenCalled();
  });

  it("401s when unauthorized", async () => {
    verifyKitAuthMock.mockResolvedValue(null);
    expect((await POST(req(), ctx())).status).toBe(401);
  });

  it("404s for an unknown transaction", async () => {
    readMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await POST(req(), ctx())).status).toBe(404);
  });
});
```

- [ ] **Step 2: run — fails** (`./route` doesn't exist).

- [ ] **Step 3: implement `src/app/api/v1/checkout/[id]/claim/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyKitAuth } from "@/lib/kit-auth";
import { claimTransition, type TxStatus } from "@/lib/tx-state";
import { toStatusResponse } from "@/lib/api-schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyKitAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createServiceClient();

  const { data: current, error: readError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    console.error("claim: read failed", readError.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  if (!current)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { status, changed } = claimTransition(current.status as TxStatus);
  if (!changed) return NextResponse.json(toStatusResponse(current));

  const { data: updated, error: updateError } = await supabase
    .from("transactions")
    .update({ status, claimed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .single();
  if (updateError || !updated) {
    const { data: recheck } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!recheck)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(toStatusResponse(recheck));
  }

  return NextResponse.json(toStatusResponse(updated));
}
```

- [ ] **Step 4: run — passes.**

```bash
pnpm test -- src/app/api/v1/checkout/[id]/claim/route.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: write the failing test** `src/app/api/v1/checkout/[id]/confirm/route.test.ts` (same fixture shape as claim's, `status` starting `"claimed"`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

const {
  verifyKitAuthMock,
  readMaybeSingle,
  updateSingle,
  createServiceClientMock,
} = vi.hoisted(() => ({
  verifyKitAuthMock: vi.fn(),
  readMaybeSingle: vi.fn(),
  updateSingle: vi.fn(),
  createServiceClientMock: vi.fn(),
}));

vi.mock("@/lib/kit-auth", () => ({ verifyKitAuth: verifyKitAuthMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));

const ROW = {
  id: "tx1",
  status: "claimed",
  amount_cents: 450,
  order_ref: "A-001",
  kit_slug: "qkit",
  claimed_at: "2026-07-15T00:01:00Z",
  confirmed_at: null,
  created_at: "2026-07-15T00:00:00Z",
};

function fakeSupabase() {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: readMaybeSingle }) }),
      update: () => ({
        eq: () => ({
          in: () => ({ select: () => ({ single: updateSingle }) }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  verifyKitAuthMock.mockReset().mockResolvedValue({ kitSlug: "qkit" });
  createServiceClientMock.mockReset().mockResolvedValue(fakeSupabase());
  readMaybeSingle.mockReset().mockResolvedValue({ data: ROW, error: null });
  updateSingle.mockReset().mockResolvedValue({
    data: { ...ROW, status: "confirmed", confirmed_at: "2026-07-15T00:02:00Z" },
    error: null,
  });
});

function req() {
  return new Request("http://localhost/api/v1/checkout/tx1/confirm", {
    method: "POST",
    headers: { authorization: "Bearer qkit:secret" },
  });
}
function ctx() {
  return { params: Promise.resolve({ id: "tx1" }) };
}

describe("POST /api/v1/checkout/[id]/confirm", () => {
  it("confirms a claimed transaction", async () => {
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("confirmed");
    expect(json.confirmed_at).toBe("2026-07-15T00:02:00Z");
  });

  it("is idempotent on an already-confirmed transaction (no update call)", async () => {
    readMaybeSingle.mockResolvedValue({
      data: { ...ROW, status: "confirmed" },
      error: null,
    });
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(updateSingle).not.toHaveBeenCalled();
  });

  it("401s when unauthorized", async () => {
    verifyKitAuthMock.mockResolvedValue(null);
    expect((await POST(req(), ctx())).status).toBe(401);
  });

  it("404s for an unknown transaction", async () => {
    readMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await POST(req(), ctx())).status).toBe(404);
  });
});
```

- [ ] **Step 6: run — fails.**

- [ ] **Step 7: implement `src/app/api/v1/checkout/[id]/confirm/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyKitAuth } from "@/lib/kit-auth";
import { confirmTransition, type TxStatus } from "@/lib/tx-state";
import { toStatusResponse } from "@/lib/api-schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyKitAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createServiceClient();

  const { data: current, error: readError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    console.error("confirm: read failed", readError.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  if (!current)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { status, changed } = confirmTransition(current.status as TxStatus);
  if (!changed) return NextResponse.json(toStatusResponse(current));

  const { data: updated, error: updateError } = await supabase
    .from("transactions")
    .update({ status, confirmed_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["pending", "claimed"])
    .select("*")
    .single();
  if (updateError || !updated) {
    const { data: recheck } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!recheck)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(toStatusResponse(recheck));
  }

  return NextResponse.json(toStatusResponse(updated));
}
```

- [ ] **Step 8: run — passes.**

```bash
pnpm test -- src/app/api/v1/checkout/[id]/confirm/route.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 9: verify + commit.**

```bash
pnpm check
git add src/app/api/v1/checkout/[id]/claim src/app/api/v1/checkout/[id]/confirm
git commit -m "feat: POST /api/v1/checkout/{id}/claim + /confirm"
```

---

### Task 12: HTTP API — status + vendor config lookup

**Files:**

- Create: `src/app/api/v1/checkout/[id]/route.ts`, `src/app/api/v1/checkout/[id]/route.test.ts`
- Create: `src/app/api/v1/vendors/[vendor_id]/config/route.ts`, `src/app/api/v1/vendors/[vendor_id]/config/route.test.ts`

**Interfaces:**

- Consumes: `verifyKitAuth` (Task 8), `createServiceClient` (Task 3), `toStatusResponse` (Task 6).
- Produces: `GET /api/v1/checkout/{id}` → `TransactionStatusResponse` (200) / `{error}` (401/404/503); `GET /api/v1/vendors/{vendor_id}/config` → `VendorConfigResponse` (200) / `{error}` (401/503). Never returns `secret_hash` or any config field beyond `payee_name`.

- [ ] **Step 1: write the failing test** `src/app/api/v1/checkout/[id]/route.test.ts`:

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
  maybeSingleMock.mockReset().mockResolvedValue({
    data: {
      id: "tx1",
      status: "confirmed",
      amount_cents: 450,
      order_ref: "A-001",
      kit_slug: "qkit",
      claimed_at: "2026-07-15T00:01:00Z",
      confirmed_at: "2026-07-15T00:02:00Z",
      created_at: "2026-07-15T00:00:00Z",
    },
    error: null,
  });
});

function req() {
  return new Request("http://localhost/api/v1/checkout/tx1", {
    headers: { authorization: "Bearer qkit:secret" },
  });
}
function ctx() {
  return { params: Promise.resolve({ id: "tx1" }) };
}

describe("GET /api/v1/checkout/[id]", () => {
  it("returns the current status", async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("confirmed");
  });
  it("401s when unauthorized", async () => {
    verifyKitAuthMock.mockResolvedValue(null);
    expect((await GET(req(), ctx())).status).toBe(401);
  });
  it("404s for an unknown transaction", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    expect((await GET(req(), ctx())).status).toBe(404);
  });
});
```

- [ ] **Step 2: run — fails.**

- [ ] **Step 3: implement `src/app/api/v1/checkout/[id]/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyKitAuth } from "@/lib/kit-auth";
import { toStatusResponse } from "@/lib/api-schemas";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyKitAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("status: read failed", error.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(toStatusResponse(data));
}
```

- [ ] **Step 4: run — passes.**

```bash
pnpm test -- src/app/api/v1/checkout/[id]/route.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: write the failing test** `src/app/api/v1/vendors/[vendor_id]/config/route.test.ts`:

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

function req() {
  return new Request("http://localhost/api/v1/vendors/v1/config", {
    headers: { authorization: "Bearer qkit:secret" },
  });
}
function ctx() {
  return { params: Promise.resolve({ vendor_id: "v1" }) };
}

describe("GET /api/v1/vendors/[vendor_id]/config", () => {
  it("reports has_config true + payee_name when configured", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { payee_name: "Kopitiam Cart" },
      error: null,
    });
    const res = await GET(req(), ctx());
    expect(await res.json()).toEqual({
      has_config: true,
      payee_name: "Kopitiam Cart",
    });
  });
  it("reports has_config false when unconfigured", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await GET(req(), ctx());
    expect(await res.json()).toEqual({ has_config: false, payee_name: null });
  });
  it("401s when unauthorized", async () => {
    verifyKitAuthMock.mockResolvedValue(null);
    expect((await GET(req(), ctx())).status).toBe(401);
  });
});
```

- [ ] **Step 6: run — fails.**

- [ ] **Step 7: implement `src/app/api/v1/vendors/[vendor_id]/config/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyKitAuth } from "@/lib/kit-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ vendor_id: string }> },
) {
  const auth = await verifyKitAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { vendor_id } = await params;
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("vendor_payment_config")
    .select("payee_name")
    .eq("vendor_id", vendor_id)
    .maybeSingle();
  if (error) {
    console.error("vendor config: read failed", error.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  return NextResponse.json({
    has_config: Boolean(data),
    payee_name: data?.payee_name ?? null,
  });
}
```

- [ ] **Step 8: run — passes.**

```bash
pnpm test -- src/app/api/v1/vendors/[vendor_id]/config/route.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 9: verify + commit.**

```bash
pnpm check
git add src/app/api/v1/checkout/[id]/route.ts src/app/api/v1/checkout/[id]/route.test.ts src/app/api/v1/vendors
git commit -m "feat: GET /api/v1/checkout/{id} + GET /api/v1/vendors/{vendor_id}/config"
```

---

### Task 13: Vendor dashboard — PayNow config form

**Files:**

- Create: `src/app/dashboard/config/page.tsx`, `src/app/dashboard/config/actions.ts`, `src/app/dashboard/config/actions.test.ts`
- Create: `src/app/dashboard/config/payment-config-form.tsx`, `src/app/dashboard/config/payment-config-form.dom.test.tsx`

**Interfaces:**

- Consumes: `createServerClient` (Task 3), `vendorPaymentConfigInputSchema` (Task 6), `buildPayNowPayload` (Task 5), shadcn `button`/`input`/`label`/`radio-group` (Task 1).
- Produces: `getConfig(): Promise<VendorPaymentConfig | null>`, `type SaveConfigState = { status: "idle" | "ok" | "error"; message?: string }`, `saveConfigAction(prev, formData): Promise<SaveConfigState>`, `<PaymentConfigForm initial={...} />`.

- [ ] **Step 1: write the failing test** `src/app/dashboard/config/actions.test.ts`:

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
  it("saves a valid UEN config", async () => {
    const { saveConfigAction } = await import("./actions");
    const result = await saveConfigAction(
      { status: "idle" },
      formData({ payee_name: "Kopitiam Cart", uen: "53312345A", mobile: "" }),
    );
    expect(result.status).toBe("ok");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_id: "v1",
        uen: "53312345A",
        mobile: null,
      }),
      { onConflict: "vendor_id" },
    );
  });

  it("returns an error for an invalid config (both uen and mobile)", async () => {
    const { saveConfigAction } = await import("./actions");
    const result = await saveConfigAction(
      { status: "idle" },
      formData({
        payee_name: "Kopitiam Cart",
        uen: "53312345A",
        mobile: "+6591234567",
      }),
    );
    expect(result.status).toBe("error");
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: run — fails** (`./actions` doesn't exist).

- [ ] **Step 3: implement `src/app/dashboard/config/actions.ts`:**

```ts
"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { vendorPaymentConfigInputSchema } from "@/lib/schemas";
import type { VendorPaymentConfig } from "@/lib/types";

async function requireVendor() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function getConfig(): Promise<VendorPaymentConfig | null> {
  const { supabase, user } = await requireVendor();
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
  const { supabase, user } = await requireVendor();
  const parsed = vendorPaymentConfigInputSchema.safeParse({
    payee_name: formData.get("payee_name") ?? "",
    uen: formData.get("uen") ?? "",
    mobile: formData.get("mobile") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { error } = await supabase.from("vendor_payment_config").upsert(
    {
      vendor_id: user.id,
      payee_name: parsed.data.payee_name,
      uen: parsed.data.uen ?? null,
      mobile: parsed.data.mobile ?? null,
    },
    { onConflict: "vendor_id" },
  );
  if (error) {
    console.error("saveConfigAction failed", error.message);
    return { status: "error", message: "Could not save. Try again." };
  }
  return { status: "ok" };
}
```

- [ ] **Step 4: run — passes.**

```bash
pnpm test -- src/app/dashboard/config/actions.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: write the failing DOM test** `src/app/dashboard/config/payment-config-form.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentConfigForm } from "./payment-config-form";

describe("PaymentConfigForm", () => {
  it("shows the UEN field by default and switches to mobile on toggle", () => {
    render(<PaymentConfigForm initial={null} />);
    expect(screen.getByLabelText("UEN")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /mobile/i }));
    expect(screen.getByLabelText("Mobile")).toBeInTheDocument();
  });

  it("renders a QR preview once payee name + identifier are filled", () => {
    render(<PaymentConfigForm initial={null} />);
    expect(document.querySelector("svg")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Payee name"), {
      target: { value: "Kopitiam Cart" },
    });
    fireEvent.change(screen.getByLabelText("UEN"), {
      target: { value: "53312345A" },
    });
    expect(document.querySelector("svg")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: run — fails** (`./payment-config-form` doesn't exist).

- [ ] **Step 7: implement `src/app/dashboard/config/payment-config-form.tsx`:**

```tsx
"use client";

import { useActionState, useState } from "react";
import QRCode from "react-qr-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { buildPayNowPayload } from "@/lib/payments/paynow";
import { saveConfigAction, type SaveConfigState } from "./actions";
import type { VendorPaymentConfig } from "@/lib/types";

type IdKind = "uen" | "mobile";

export function PaymentConfigForm({
  initial,
}: {
  initial: VendorPaymentConfig | null;
}) {
  const [state, formAction, pending] = useActionState<
    SaveConfigState,
    FormData
  >(saveConfigAction, { status: "idle" });
  const [kind, setKind] = useState<IdKind>(initial?.mobile ? "mobile" : "uen");
  const [payeeName, setPayeeName] = useState(initial?.payee_name ?? "");
  const [uen, setUen] = useState(initial?.uen ?? "");
  const [mobile, setMobile] = useState(initial?.mobile ?? "");

  const previewPayload =
    payeeName && (kind === "uen" ? uen : mobile)
      ? buildPayNowPayload({
          uen: kind === "uen" ? uen : undefined,
          mobile: kind === "mobile" ? mobile : undefined,
          payeeName,
          amountCents: 100,
          reference: "PREVIEW",
        })
      : null;

  return (
    <form action={formAction} className="space-y-6">
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
        value={kind}
        onValueChange={(v) => setKind(v as IdKind)}
        className="flex gap-4"
      >
        <label className="flex items-center gap-2">
          <RadioGroupItem value="uen" aria-label="UEN" /> UEN
        </label>
        <label className="flex items-center gap-2">
          <RadioGroupItem value="mobile" aria-label="Mobile" /> Mobile
        </label>
      </RadioGroup>

      {kind === "uen" ? (
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

      {state.status === "error" && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      )}
      {state.status === "ok" && (
        <p className="text-sm font-medium text-emerald-600">Saved.</p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save PayNow config"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 8: `src/app/dashboard/config/page.tsx`:**

```tsx
import { getConfig } from "./actions";
import { PaymentConfigForm } from "./payment-config-form";

export default async function ConfigPage() {
  const config = await getConfig();
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-2xl font-semibold tracking-tight">PayNow setup</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Set this up once — it&apos;s reused by every kit that uses paykit for
        you.
      </p>
      <div className="mt-6">
        <PaymentConfigForm initial={config} />
      </div>
    </main>
  );
}
```

- [ ] **Step 9: run — passes.**

```bash
pnpm test -- src/app/dashboard/config
```

Expected: PASS, 4 tests total (2 action + 2 DOM).

- [ ] **Step 10: verify + commit.**

```bash
pnpm check
git add src/app/dashboard/config
git commit -m "feat: vendor dashboard — PayNow config form"
```

---

### Task 14: Vendor dashboard — unified transaction log + usage meter

**Files:**

- Create: `src/lib/transactions.ts`, `src/lib/transactions.test.ts`
- Modify: `src/lib/usage.ts`, `src/lib/usage.test.ts` (add `usagePercent`)
- Create: `src/app/dashboard/page.tsx`
- Create: `src/app/dashboard/transactions/page.tsx`, `src/app/dashboard/transactions/transaction-table.tsx`, `src/app/dashboard/transactions/transaction-table.dom.test.tsx`

**Interfaces:**

- Consumes: `createServerClient` (Task 3), `Transaction`/`VendorPlan` (Task 4), shadcn `table`/`badge` (Task 1).
- Produces: `listTransactions(vendorId): Promise<Transaction[]>`, `txCountThisMonth(vendorId): Promise<number>`, `usagePercent(count: number, cap?: number): number`, `<TransactionTable transactions={...} isPro={...} />`.

- [ ] **Step 1: write the failing test** (extends `src/lib/usage.test.ts` from Task 10):

```ts
import { describe, it, expect } from "vitest";
import { freeTierExceeded, usagePercent } from "./usage";

describe("freeTierExceeded", () => {
  it("false for a free vendor under the cap", () => {
    expect(freeTierExceeded("free", 99)).toBe(false);
  });
  it("true for a free vendor at the cap", () => {
    expect(freeTierExceeded("free", 100)).toBe(true);
  });
  it("true for a free vendor over the cap", () => {
    expect(freeTierExceeded("free", 150)).toBe(true);
  });
  it("false for a pro vendor at any count", () => {
    expect(freeTierExceeded("pro", 100_000)).toBe(false);
  });
});

describe("usagePercent", () => {
  it("0 at zero usage", () => {
    expect(usagePercent(0)).toBe(0);
  });
  it("50 at half the default 100 cap", () => {
    expect(usagePercent(50)).toBe(50);
  });
  it("clamps to 100 when over cap", () => {
    expect(usagePercent(150)).toBe(100);
  });
  it("honors a custom cap", () => {
    expect(usagePercent(10, 20)).toBe(50);
  });
});
```

- [ ] **Step 2: run — fails** (`usagePercent` not exported yet).

- [ ] **Step 3: extend `src/lib/usage.ts`:**

```ts
import type { VendorPlan } from "@/lib/types";

/** Free tier: 100 tx/mo per vendor, counted across every kit. */
export function freeTierExceeded(
  plan: VendorPlan,
  countThisMonth: number,
): boolean {
  return plan === "free" && countThisMonth >= 100;
}

/** Usage-meter bar fill, 0–100, clamped. */
export function usagePercent(count: number, cap = 100): number {
  return Math.min(100, Math.max(0, Math.round((count / cap) * 100)));
}
```

- [ ] **Step 4: run — passes.**

```bash
pnpm test -- src/lib/usage.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: write the failing test** `src/lib/transactions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { orderMock, rpcMock, createServerClientMock } = vi.hoisted(() => ({
  orderMock: vi.fn(),
  rpcMock: vi.fn(),
  createServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: createServerClientMock,
}));

beforeEach(() => {
  orderMock
    .mockReset()
    .mockResolvedValue({ data: [{ id: "tx1" }], error: null });
  rpcMock.mockReset().mockResolvedValue({ data: 7, error: null });
  createServerClientMock.mockReset().mockResolvedValue({
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ limit: orderMock }) }) }),
    }),
    rpc: rpcMock,
  });
});

describe("listTransactions", () => {
  it("returns the vendor's transactions", async () => {
    const { listTransactions } = await import("./transactions");
    expect(await listTransactions("v1")).toEqual([{ id: "tx1" }]);
  });
});

describe("txCountThisMonth", () => {
  it("returns the RPC count", async () => {
    const { txCountThisMonth } = await import("./transactions");
    expect(await txCountThisMonth("v1")).toBe(7);
    expect(rpcMock).toHaveBeenCalledWith("tx_count_this_month", {
      p_vendor: "v1",
    });
  });
});
```

- [ ] **Step 6: run — fails** (`./transactions` doesn't exist).

- [ ] **Step 7: implement `src/lib/transactions.ts`:**

```ts
import { createServerClient } from "@/lib/supabase/server";
import type { Transaction } from "@/lib/types";

export async function listTransactions(
  vendorId: string,
): Promise<Transaction[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("listTransactions failed", error.message);
    return [];
  }
  return data ?? [];
}

export async function txCountThisMonth(vendorId: string): Promise<number> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("tx_count_this_month", {
    p_vendor: vendorId,
  });
  if (error) {
    console.error("txCountThisMonth failed", error.message);
    return 0;
  }
  return data ?? 0;
}
```

- [ ] **Step 8: run — passes.**

```bash
pnpm test -- src/lib/transactions.test.ts
```

- [ ] **Step 9: write the failing DOM test** `src/app/dashboard/transactions/transaction-table.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransactionTable } from "./transaction-table";
import type { Transaction } from "@/lib/types";

const TX: Transaction = {
  id: "tx1",
  vendor_id: "v1",
  kit_slug: "qkit",
  order_ref: "A-001",
  amount_cents: 450,
  status: "confirmed",
  qr_payload: "0002...",
  claimed_at: "2026-07-15T00:01:00Z",
  confirmed_at: "2026-07-15T00:02:00Z",
  created_at: "2026-07-15T00:00:00Z",
};

describe("TransactionTable", () => {
  it("renders one row per transaction with kit, order ref, amount, status", () => {
    render(<TransactionTable transactions={[TX]} isPro={false} />);
    expect(screen.getByText("qkit")).toBeInTheDocument();
    expect(screen.getByText("A-001")).toBeInTheDocument();
    expect(screen.getByText("confirmed")).toBeInTheDocument();
  });

  it("shows an empty state with no transactions", () => {
    render(<TransactionTable transactions={[]} isPro={false} />);
    expect(screen.getByText(/no transactions yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: run — fails** (`./transaction-table` doesn't exist).

- [ ] **Step 11: implement `src/app/dashboard/transactions/transaction-table.tsx`** (Task 15 later modifies this file to add a Pro-only refund action column):

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Transaction } from "@/lib/types";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
  }).format(cents / 100);
}

export function TransactionTable({
  transactions,
  isPro,
}: {
  transactions: Transaction[];
  isPro: boolean;
}) {
  if (transactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No transactions yet.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kit</TableHead>
          <TableHead>Order ref</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => (
          <TableRow key={tx.id}>
            <TableCell>{tx.kit_slug}</TableCell>
            <TableCell>{tx.order_ref}</TableCell>
            <TableCell>{formatCents(tx.amount_cents)}</TableCell>
            <TableCell>
              <Badge
                variant={tx.status === "confirmed" ? "default" : "secondary"}
              >
                {tx.status}
              </Badge>
            </TableCell>
            <TableCell>
              {new Date(tx.created_at).toLocaleDateString("en-SG")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

`isPro` is accepted now (unused in the JSX) so Task 15 only needs to add markup, not change this component's public signature — later tasks must not rename this prop.

- [ ] **Step 12: `src/app/dashboard/transactions/page.tsx`:**

```tsx
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { listTransactions } from "@/lib/transactions";
import { TransactionTable } from "./transaction-table";

export default async function TransactionsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: config } = await supabase
    .from("vendor_payment_config")
    .select("plan")
    .eq("vendor_id", user.id)
    .maybeSingle();
  const transactions = await listTransactions(user.id);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every checkout paykit has run for you, across every kit.
      </p>
      <div className="mt-6">
        <TransactionTable
          transactions={transactions}
          isPro={config?.plan === "pro"}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 13: `src/app/dashboard/page.tsx`** (overview: usage meter + nav):

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { txCountThisMonth } from "@/lib/transactions";
import { usagePercent } from "@/lib/usage";

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: config } = await supabase
    .from("vendor_payment_config")
    .select("plan")
    .eq("vendor_id", user.id)
    .maybeSingle();
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

      {plan === "free" && (
        <div className="rounded-xl border p-4">
          <p className="text-sm font-medium">
            {count} / 100 transactions this month
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary"
              style={{ width: `${usagePercent(count)}%` }}
            />
          </div>
        </div>
      )}

      <nav className="flex gap-4 text-sm font-medium">
        <Link href="/dashboard/config" className="underline underline-offset-4">
          PayNow setup
        </Link>
        <Link
          href="/dashboard/transactions"
          className="underline underline-offset-4"
        >
          Transactions
        </Link>
        <Link
          href="/dashboard/reports"
          className="underline underline-offset-4"
        >
          Reports
        </Link>
      </nav>
    </main>
  );
}
```

- [ ] **Step 14: run — passes.**

```bash
pnpm test -- src/lib/transactions.test.ts src/app/dashboard/transactions
```

- [ ] **Step 15: verify + commit.**

```bash
pnpm check
git add src/lib/transactions.ts src/lib/transactions.test.ts src/lib/usage.ts src/lib/usage.test.ts src/app/dashboard/page.tsx src/app/dashboard/transactions
git commit -m "feat: vendor dashboard — unified transaction log + usage meter"
```

---

### Task 15: Vendor dashboard — revenue reports (Pro) + refund ledger entry (Pro)

**Files:**

- Create: `src/lib/revenue-report.ts`, `src/lib/revenue-report.test.ts`
- Create: `src/app/dashboard/reports/page.tsx`, `src/app/dashboard/reports/revenue-chart.tsx`
- Create: `src/app/dashboard/transactions/actions.ts`, `src/app/dashboard/transactions/actions.test.ts`
- Create: `src/app/dashboard/transactions/refund-dialog.tsx`, `src/app/dashboard/transactions/refund-dialog.dom.test.tsx`
- Modify: `src/app/dashboard/transactions/transaction-table.tsx` (add the Pro-only refund action per confirmed row)

**Interfaces:**

- Consumes: `Transaction` (Task 4), `createServerClient` (Task 3), shadcn `dialog` (Task 1), `TransactionTable` (Task 14 — same `{ transactions, isPro }` props, no signature change).
- Produces: `aggregateRevenueByDay(transactions): { date: string; cents: number }[]`, `type RefundState = { status: "idle" | "ok" | "error"; message?: string }`, `issueRefundAction(prev, formData): Promise<RefundState>`, `<RevenueChart data={...} />`, `<RefundDialog transactionId={...} />`.

- [ ] **Step 1: write the failing test** `src/lib/revenue-report.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregateRevenueByDay } from "./revenue-report";
import type { Transaction } from "@/lib/types";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: "tx",
    vendor_id: "v1",
    kit_slug: "qkit",
    order_ref: "A",
    amount_cents: 100,
    status: "confirmed",
    qr_payload: "x",
    claimed_at: null,
    confirmed_at: null,
    created_at: "2026-07-15T00:00:00Z",
    ...overrides,
  };
}

describe("aggregateRevenueByDay", () => {
  it("sums same-day confirmed transactions", () => {
    const result = aggregateRevenueByDay([
      tx({ amount_cents: 100, created_at: "2026-07-15T01:00:00Z" }),
      tx({ amount_cents: 200, created_at: "2026-07-15T23:00:00Z" }),
    ]);
    expect(result).toEqual([{ date: "2026-07-15", cents: 300 }]);
  });

  it("excludes non-confirmed transactions", () => {
    const result = aggregateRevenueByDay([
      tx({ status: "pending", amount_cents: 500 }),
      tx({ status: "claimed", amount_cents: 500 }),
    ]);
    expect(result).toEqual([]);
  });

  it("sorts ascending by date", () => {
    const result = aggregateRevenueByDay([
      tx({ created_at: "2026-07-16T00:00:00Z", amount_cents: 100 }),
      tx({ created_at: "2026-07-14T00:00:00Z", amount_cents: 100 }),
    ]);
    expect(result.map((r) => r.date)).toEqual(["2026-07-14", "2026-07-16"]);
  });
});
```

- [ ] **Step 2: run — fails** (`./revenue-report` doesn't exist).

- [ ] **Step 3: implement `src/lib/revenue-report.ts`:**

```ts
import type { Transaction } from "@/lib/types";

export type DailyRevenue = { date: string; cents: number };

/** Aggregates confirmed transactions into per-day totals (UTC date, sorted ascending). Non-confirmed transactions are excluded — they haven't become revenue yet. */
export function aggregateRevenueByDay(
  transactions: Transaction[],
): DailyRevenue[] {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.status !== "confirmed") continue;
    const date = tx.created_at.slice(0, 10);
    totals.set(date, (totals.get(date) ?? 0) + tx.amount_cents);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cents]) => ({ date, cents }));
}
```

- [ ] **Step 4: run — passes.**

```bash
pnpm test -- src/lib/revenue-report.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: write the failing test** `src/app/dashboard/transactions/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUserMock, insertMock, createServerClientMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  insertMock: vi.fn(),
  createServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: createServerClientMock,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: "v1" } } });
  insertMock.mockReset().mockResolvedValue({ error: null });
  createServerClientMock.mockReset().mockResolvedValue({
    auth: { getUser: getUserMock },
    from: () => ({ insert: insertMock }),
  });
});

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("issueRefundAction", () => {
  it("inserts a refund row for a valid amount", async () => {
    const { issueRefundAction } = await import("./actions");
    const result = await issueRefundAction(
      { status: "idle" },
      formData({
        transaction_id: "tx1",
        refunded_amount_cents: "450",
        reason: "damaged",
      }),
    );
    expect(result.status).toBe("ok");
    expect(insertMock).toHaveBeenCalledWith({
      transaction_id: "tx1",
      refunded_amount_cents: 450,
      reason: "damaged",
      created_by: "v1",
    });
  });

  it("rejects a non-positive amount without inserting", async () => {
    const { issueRefundAction } = await import("./actions");
    const result = await issueRefundAction(
      { status: "idle" },
      formData({
        transaction_id: "tx1",
        refunded_amount_cents: "0",
        reason: "",
      }),
    );
    expect(result.status).toBe("error");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("surfaces a friendly error when the DB rejects the insert (e.g. RLS: not Pro / not confirmed)", async () => {
    insertMock.mockResolvedValue({
      error: { message: "new row violates row-level security policy" },
    });
    const { issueRefundAction } = await import("./actions");
    const result = await issueRefundAction(
      { status: "idle" },
      formData({
        transaction_id: "tx1",
        refunded_amount_cents: "450",
        reason: "",
      }),
    );
    expect(result.status).toBe("error");
  });
});
```

- [ ] **Step 6: run — fails** (`./actions` doesn't exist).

- [ ] **Step 7: implement `src/app/dashboard/transactions/actions.ts`** (relies on the `refunds_insert_own` RLS policy from Task 4 to enforce Pro + confirmed + ownership — the action only validates shape):

```ts
"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export type RefundState = { status: "idle" | "ok" | "error"; message?: string };

async function requireVendor() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function issueRefundAction(
  _prev: RefundState,
  formData: FormData,
): Promise<RefundState> {
  const { supabase, user } = await requireVendor();
  const transactionId = String(formData.get("transaction_id") ?? "");
  const amount = Number(formData.get("refunded_amount_cents"));
  const reason = String(formData.get("reason") ?? "") || null;

  if (!transactionId || !Number.isInteger(amount) || amount <= 0) {
    return { status: "error", message: "Enter a valid refund amount." };
  }

  const { error } = await supabase.from("refunds").insert({
    transaction_id: transactionId,
    refunded_amount_cents: amount,
    reason,
    created_by: user.id,
  });
  if (error) {
    console.error("issueRefundAction failed", error.message);
    return {
      status: "error",
      message:
        "Could not record refund — check the transaction is confirmed and you're on Pro.",
    };
  }
  return { status: "ok" };
}
```

- [ ] **Step 8: run — passes.**

```bash
pnpm test -- src/app/dashboard/transactions/actions.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 9: write the failing DOM test** `src/app/dashboard/transactions/refund-dialog.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RefundDialog } from "./refund-dialog";

describe("RefundDialog", () => {
  it("opens and shows the refund form with the transaction id wired in", () => {
    render(<RefundDialog transactionId="tx1" />);
    fireEvent.click(screen.getByRole("button", { name: /refund/i }));
    const hidden = screen.getByDisplayValue("tx1") as HTMLInputElement;
    expect(hidden.name).toBe("transaction_id");
  });
});
```

- [ ] **Step 10: run — fails** (`./refund-dialog` doesn't exist).

- [ ] **Step 11: implement `src/app/dashboard/transactions/refund-dialog.tsx`:**

```tsx
"use client";

import { useActionState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { issueRefundAction, type RefundState } from "./actions";

export function RefundDialog({ transactionId }: { transactionId: string }) {
  const [state, formAction, pending] = useActionState<RefundState, FormData>(
    issueRefundAction,
    { status: "idle" },
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Refund
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue a refund</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="transaction_id" value={transactionId} />
          <div className="space-y-2">
            <Label htmlFor="refunded_amount_cents">Amount (cents)</Label>
            <Input
              id="refunded_amount_cents"
              name="refunded_amount_cents"
              type="number"
              min={1}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Input id="reason" name="reason" />
          </div>
          {state.status === "error" && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.message}
            </p>
          )}
          {state.status === "ok" && (
            <p className="text-sm font-medium text-emerald-600">
              Refund recorded.
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Recording…" : "Record refund"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 12: run — passes.**

```bash
pnpm test -- src/app/dashboard/transactions/refund-dialog.dom.test.tsx
```

- [ ] **Step 13: modify `src/app/dashboard/transactions/transaction-table.tsx`** to add a Pro-only refund action column (the `{ transactions, isPro }` props from Task 14 are unchanged — only the JSX gains a column):

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RefundDialog } from "./refund-dialog";
import type { Transaction } from "@/lib/types";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
  }).format(cents / 100);
}

export function TransactionTable({
  transactions,
  isPro,
}: {
  transactions: Transaction[];
  isPro: boolean;
}) {
  if (transactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No transactions yet.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kit</TableHead>
          <TableHead>Order ref</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          {isPro && <TableHead>Refund</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => (
          <TableRow key={tx.id}>
            <TableCell>{tx.kit_slug}</TableCell>
            <TableCell>{tx.order_ref}</TableCell>
            <TableCell>{formatCents(tx.amount_cents)}</TableCell>
            <TableCell>
              <Badge
                variant={tx.status === "confirmed" ? "default" : "secondary"}
              >
                {tx.status}
              </Badge>
            </TableCell>
            <TableCell>
              {new Date(tx.created_at).toLocaleDateString("en-SG")}
            </TableCell>
            {isPro && (
              <TableCell>
                {tx.status === "confirmed" && (
                  <RefundDialog transactionId={tx.id} />
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 14: revenue report UI.** `src/app/dashboard/reports/revenue-chart.tsx`:

```tsx
"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyRevenue } from "@/lib/revenue-report";

export function RevenueChart({ data }: { data: DailyRevenue[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data.map((d) => ({ ...d, dollars: d.cents / 100 }))}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" fontSize={12} />
        <YAxis fontSize={12} />
        <Bar dataKey="dollars" fill="var(--color-primary)" radius={4} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

`src/app/dashboard/reports/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { listTransactions } from "@/lib/transactions";
import { aggregateRevenueByDay } from "@/lib/revenue-report";
import { RevenueChart } from "./revenue-chart";

export default async function ReportsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: config } = await supabase
    .from("vendor_payment_config")
    .select("plan")
    .eq("vendor_id", user.id)
    .maybeSingle();

  if (config?.plan !== "pro") {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Revenue reports are a Pro feature — upgrade to see aggregated revenue
          across every kit that uses paykit for you.
        </p>
      </main>
    );
  }

  const transactions = await listTransactions(user.id);
  const data = aggregateRevenueByDay(transactions);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Confirmed revenue by day, aggregated across every kit.
      </p>
      <div className="mt-6">
        <RevenueChart data={data} />
      </div>
    </main>
  );
}
```

- [ ] **Step 15: verify + commit.**

```bash
pnpm check
pnpm test
git add src/lib/revenue-report.ts src/lib/revenue-report.test.ts src/app/dashboard/reports src/app/dashboard/transactions
git commit -m "feat: vendor dashboard — revenue reports + refund ledger entry (Pro)"
```

---

### Task 16: Contract test — HTTP API surface

**Files:**

- Create: `test/contract/checkout-response.sample.json`, `test/contract/transaction-status.sample.json`, `test/contract/vendor-config.sample.json`
- Create: `test/contract/paykit-api.contract.test.ts`

**Interfaces:**

- Consumes: `checkoutResponseSchema`, `transactionStatusResponseSchema`, `vendorConfigResponseSchema` (Task 6).
- Produces: none — this is a locked-contract guard, mirroring `merqo/test/contract/qkit-metrics.contract.test.ts` (a hand-authored sample validated against the schema the API and its future consumers both import). Once a real calling kit integrates (future work, out of scope here), these samples should be replaced with a captured live response, same note as merqo's precedent.

- [ ] **Step 1: write the failing test** `test/contract/paykit-api.contract.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  checkoutResponseSchema,
  transactionStatusResponseSchema,
  vendorConfigResponseSchema,
} from "@/lib/api-schemas";

function loadSample(name: string) {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8"),
  );
}

describe("paykit /api/v1 contract", () => {
  it("POST /api/v1/checkout response satisfies checkoutResponseSchema", () => {
    const parsed = checkoutResponseSchema.safeParse(
      loadSample("checkout-response.sample.json"),
    );
    expect(parsed.success, JSON.stringify(parsed.error?.format())).toBe(true);
  });

  it("claim/confirm/status responses satisfy transactionStatusResponseSchema", () => {
    const parsed = transactionStatusResponseSchema.safeParse(
      loadSample("transaction-status.sample.json"),
    );
    expect(parsed.success, JSON.stringify(parsed.error?.format())).toBe(true);
  });

  it("GET /api/v1/vendors/{vendor_id}/config response satisfies vendorConfigResponseSchema", () => {
    const parsed = vendorConfigResponseSchema.safeParse(
      loadSample("vendor-config.sample.json"),
    );
    expect(parsed.success, JSON.stringify(parsed.error?.format())).toBe(true);
  });

  it("vendor-config sample never carries a secret field", () => {
    const sample = loadSample("vendor-config.sample.json");
    expect(Object.keys(sample).sort()).toEqual(["has_config", "payee_name"]);
  });
});
```

- [ ] **Step 2: run — fails** (sample files don't exist).

- [ ] **Step 3: add the sample fixtures.**

`test/contract/checkout-response.sample.json`:

```json
{
  "transaction_id": "11111111-1111-1111-1111-111111111111",
  "qr_payload": "00020101021226280009SG.PAYNOW0109533123... (truncated EMVCo payload)6304ABCD"
}
```

`test/contract/transaction-status.sample.json`:

```json
{
  "transaction_id": "11111111-1111-1111-1111-111111111111",
  "status": "confirmed",
  "amount_cents": 450,
  "order_ref": "A-001",
  "kit_slug": "qkit",
  "claimed_at": "2026-07-15T00:01:00Z",
  "confirmed_at": "2026-07-15T00:02:00Z",
  "created_at": "2026-07-15T00:00:00Z"
}
```

`test/contract/vendor-config.sample.json`:

```json
{
  "has_config": true,
  "payee_name": "Kopitiam Cart"
}
```

- [ ] **Step 4: run — passes.**

```bash
pnpm test -- test/contract/paykit-api.contract.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: commit.**

```bash
git add test/contract
git commit -m "test: contract test for the /api/v1 HTTP surface (mirrors merqo's qkit-metrics precedent)"
```

---

### Task 17: RLS pgTAP tests

**Files:**

- Create: `supabase/tests/rls.test.sql`

**Interfaces:**

- Consumes: the schema + policies from Task 4. No TS interfaces — this is a pgTAP suite run via `supabase test db`.

- [ ] **Step 1: write the pgTAP suite** `supabase/tests/rls.test.sql` (single rolled-back transaction, inline fixtures — same idiom as qkit's `supabase/tests/rls.test.sql`):

```sql
-- RLS cross-vendor isolation — pgTAP, run with `supabase test db`.
begin;
select plan(25);

-- ── Fixtures ──────────────────────────────────────────────────────────────
-- Vendor A: free plan, UEN config. Vendor B: pro plan, mobile config.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-a@test.local'),
  ('00000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-b@test.local');

insert into paykit.vendor_payment_config (vendor_id, uen, payee_name, plan)
values ('00000000-0000-0000-0000-00000000000a', '53312345A', 'Vendor A', 'free');
insert into paykit.vendor_payment_config (vendor_id, mobile, payee_name, plan)
values ('00000000-0000-0000-0000-00000000000b', '+6591234567', 'Vendor B', 'pro');

insert into paykit.transactions (id, vendor_id, kit_slug, order_ref, amount_cents, status, qr_payload)
values
  ('00000000-0000-0000-0000-0000000t0a01', '00000000-0000-0000-0000-00000000000a',
   'qkit', 'A-001', 500, 'pending', 'payload-a1'),
  ('00000000-0000-0000-0000-0000000t0a02', '00000000-0000-0000-0000-00000000000a',
   'qkit', 'A-002', 700, 'confirmed', 'payload-a2'),
  ('00000000-0000-0000-0000-0000000t0b01', '00000000-0000-0000-0000-00000000000b',
   'loopkit', 'B-001', 900, 'claimed', 'payload-b1'),
  ('00000000-0000-0000-0000-0000000t0b02', '00000000-0000-0000-0000-00000000000b',
   'loopkit', 'B-002', 1100, 'confirmed', 'payload-b2');

insert into paykit.kit_api_keys (kit_slug, secret_hash)
values ('qkit', 'deadbeef');

-- ── RLS is actually enabled on every protected table ─────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'paykit.vendor_payment_config'::regclass), 'RLS on vendor_payment_config');
select ok((select relrowsecurity from pg_class where oid = 'paykit.transactions'::regclass), 'RLS on transactions');
select ok((select relrowsecurity from pg_class where oid = 'paykit.refunds'::regclass), 'RLS on refunds');
select ok((select relrowsecurity from pg_class where oid = 'paykit.kit_api_keys'::regclass), 'RLS on kit_api_keys');

-- ── Act as Vendor A ────────────────────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text,
  true);

select isnt_empty(
  $$ select 1 from paykit.vendor_payment_config where vendor_id = '00000000-0000-0000-0000-00000000000a' $$,
  'A reads its own config');
select is_empty(
  $$ select 1 from paykit.vendor_payment_config where vendor_id = '00000000-0000-0000-0000-00000000000b' $$,
  'A cannot read B config');
select isnt_empty(
  $$ select 1 from paykit.transactions where id = '00000000-0000-0000-0000-0000000t0a01' $$,
  'A reads its own transaction');
select is_empty(
  $$ select 1 from paykit.transactions where id = '00000000-0000-0000-0000-0000000t0b01' $$,
  'A cannot read B transaction');

select throws_ok(
  $$ insert into paykit.transactions (vendor_id, kit_slug, order_ref, amount_cents, qr_payload)
     values ('00000000-0000-0000-0000-00000000000a', 'qkit', 'FORGED', 100, 'x') $$,
  null,
  'A cannot INSERT into transactions directly (checkout API is service-role only)');
select throws_ok(
  $$ update paykit.transactions set status = 'confirmed'
     where id = '00000000-0000-0000-0000-0000000t0a01' $$,
  null,
  'A cannot UPDATE transactions directly (claim/confirm API is service-role only)');

select lives_ok(
  $$ update paykit.vendor_payment_config set payee_name = 'Vendor A Renamed'
     where vendor_id = '00000000-0000-0000-0000-00000000000a' $$,
  'A can update its own config');
with upd as (
  update paykit.vendor_payment_config set payee_name = 'Hacked'
  where vendor_id = '00000000-0000-0000-0000-00000000000b' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B config');

select throws_ok(
  $$ insert into paykit.refunds (transaction_id, refunded_amount_cents, created_by)
     values ('00000000-0000-0000-0000-0000000t0a02', 100, '00000000-0000-0000-0000-00000000000a') $$,
  null,
  'A cannot refund its own confirmed transaction while on the free plan');
select throws_ok(
  $$ insert into paykit.refunds (transaction_id, refunded_amount_cents, created_by)
     values ('00000000-0000-0000-0000-0000000t0b02', 100, '00000000-0000-0000-0000-00000000000a') $$,
  null,
  'A cannot refund B''s transaction');
select throws_ok(
  $$ select 1 from paykit.kit_api_keys $$,
  null,
  'A (authenticated) cannot SELECT kit_api_keys at all — service-role only');

-- ── Act as Vendor B (pro) ────────────────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text,
  true);

select lives_ok(
  $$ insert into paykit.refunds (transaction_id, refunded_amount_cents, reason, created_by)
     values ('00000000-0000-0000-0000-0000000t0b02', 200, 'customer request', '00000000-0000-0000-0000-00000000000b') $$,
  'B (pro) can refund its own confirmed transaction');
select throws_ok(
  $$ insert into paykit.refunds (transaction_id, refunded_amount_cents, created_by)
     values ('00000000-0000-0000-0000-0000000t0b01', 100, '00000000-0000-0000-0000-00000000000b') $$,
  null,
  'B cannot refund its own transaction while it is only claimed, not confirmed');
select isnt_empty(
  $$ select 1 from paykit.refunds where transaction_id = '00000000-0000-0000-0000-0000000t0b02' $$,
  'B reads its own refund');

select is(
  paykit.tx_count_this_month('00000000-0000-0000-0000-00000000000b'),
  2, 'B can query its own tx_count_this_month (2 transactions)');
select throws_like(
  $$ select paykit.tx_count_this_month('00000000-0000-0000-0000-00000000000a') $$,
  '%not authorized%',
  'B cannot query A''s tx_count_this_month');

-- ── Back to A: cannot read B's refund ─────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text,
  true);
select is_empty(
  $$ select 1 from paykit.refunds where transaction_id = '00000000-0000-0000-0000-0000000t0b02' $$,
  'A cannot read B''s refund');

-- ── Act as an anonymous caller (anon role) ──────────────────────────────────
reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select throws_ok(
  $$ select 1 from paykit.vendor_payment_config limit 1 $$,
  null,
  'anon cannot SELECT vendor_payment_config');
select throws_ok(
  $$ select 1 from paykit.transactions limit 1 $$,
  null,
  'anon cannot SELECT transactions');
select throws_ok(
  $$ select 1 from paykit.refunds limit 1 $$,
  null,
  'anon cannot SELECT refunds');
select throws_ok(
  $$ select 1 from paykit.kit_api_keys limit 1 $$,
  null,
  'anon cannot SELECT kit_api_keys');

reset role;
select * from finish();
rollback;
```

- [ ] **Step 2: run.**

```bash
supabase start
supabase test db
supabase stop
```

Expected: `1..25` all `ok`.

- [ ] **Step 3: commit.**

```bash
git add supabase/tests/rls.test.sql
git commit -m "test: pgTAP RLS suite — vendor isolation, refund Pro/confirmed gate, kit_api_keys lockdown"
```

---

### Task 18: CI + deploy runbook

**Files:**

- Create: `.github/workflows/ci.yml`, `.github/workflows/security.yml`, `.github/dependabot.yml`
- Create: `docs/DEPLOY.md`

**Interfaces:** none — infra only.

- [ ] **Step 1: `.github/workflows/ci.yml`** (mirrors qkit's — `db` job runs `supabase test db` against Task 4's migration + Task 17's pgTAP suite; no e2e jobs, per Global Constraints):

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    name: check + unit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      - run: pnpm test

  db:
    name: db (migrations + pgTAP RLS)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
      - uses: supabase/setup-cli@ab058987d8d6c725971f6cf9d0b5c98467e30bd1 # v1.7.1
        with:
          version: 2.109.0
      - run: supabase start
      - run: supabase test db
      - if: always()
        run: supabase stop

  build:
    name: build (next build)
    runs-on: ubuntu-latest
    env:
      NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_ci_dummy
      SUPABASE_SECRET_KEY: sb_secret_ci_dummy
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build

  mutation:
    name: mutation (changed lib)
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Mutation-test changed src/lib files
        run: |
          git fetch origin "$GITHUB_BASE_REF" --depth=1
          FILES=$(git diff --name-only "origin/$GITHUB_BASE_REF...HEAD" \
            | grep -E '^src/lib/.*\.ts$' \
            | grep -vE '\.test\.ts$|/types\.ts$' \
            | paste -sd, -)
          if [ -z "$FILES" ]; then
            echo "No src/lib changes — skipping mutation."
            exit 0
          fi
          echo "Mutating: $FILES"
          pnpm exec stryker run --mutate "$FILES"
```

- [ ] **Step 2: `.github/workflows/security.yml`** (identical to qkit's — gitleaks + pnpm audit + CodeQL, kit-agnostic):

```yaml
name: Security

on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: "0 6 * * 1"

permissions:
  contents: read

jobs:
  gitleaks:
    name: secret scan (gitleaks)
    runs-on: ubuntu-latest
    if: github.event_name != 'schedule'
    permissions:
      contents: read
      pull-requests: read
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e # v3.0.0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  audit:
    name: dependency audit (pnpm)
    runs-on: ubuntu-latest
    if: github.event_name != 'schedule'
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --prod --audit-level=high
      - run: pnpm audit --audit-level=high || true

  codeql:
    name: CodeQL (javascript-typescript)
    runs-on: ubuntu-latest
    if: ${{ github.event.repository.private == false }}
    permissions:
      contents: read
      security-events: write
      actions: read
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
      - uses: github/codeql-action/init@02c5e83432fe5497fd85b873b6c9f16a8578e1d9 # v3
        with:
          languages: javascript-typescript
          queries: security-extended
      - uses: github/codeql-action/analyze@02c5e83432fe5497fd85b873b6c9f16a8578e1d9 # v3
        with:
          category: "/language:javascript-typescript"
```

- [ ] **Step 3: `.github/dependabot.yml`** (identical to qkit's — security updates only):

```yaml
version: 2

updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    open-pull-requests-limit: 0

  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
    open-pull-requests-limit: 0
```

- [ ] **Step 4: `docs/DEPLOY.md`:**

```markdown
# paykit — Deploy Notes

paykit runs on the **shared Merqo Supabase project** (same one as
qkit/loopkit/merqo), in its own `paykit` schema.

## First deploy

1. Add `paykit` to the Supabase project's exposed schemas (Data API config)
   so `@supabase/ssr` can query it.
2. Apply `supabase/migrations/0001_paykit_core.sql`.
3. Set Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (shared
   creds — same values as qkit/loopkit's own Vercel projects).
4. No calling kit is wired up yet in this scope — `scripts/create-kit-key.mjs`
   only needs to be run once a real cutover spec (see the design spec's
   Follow-ups) actually connects a kit to paykit.

## Notes

- paykit never touches funds — there is no payment-provider webhook to
  configure.
- Cutting qkit (or any other kit) over to call paykit, and removing qkit's
  local payment duplicate, is separate, later work — not part of this
  deploy.
```

- [ ] **Step 5: push; confirm CI green.**

```bash
git add .github docs/DEPLOY.md
git commit -m "chore: CI (check/unit/db/build/mutation) + security workflows + deploy runbook"
git push
```

Expected: all CI jobs (`test`, `db`, `build`) pass on GitHub Actions; `mutation` runs on the next PR.

---

## Self-Review

**1. Spec coverage** — walked every section of `docs/superpowers/specs/2026-07-15-paykit-mvp-design.md` against the tasks above:

- _Guiding decisions_ (extract-don't-rebuild; per-vendor not per-entity config; embedded QR not hosted redirect; no money flow; disputed/auto-verify deferred; freemium gates by scale) — Task 5 (verbatim port), Task 4 (`vendor_payment_config` PK'd by `vendor_id`, reused across kits), Task 10 (`qr_payload` returned inline, no redirect/hosted page built), Global Constraints (no money-movement code anywhere), Task 5's `autoVerify` dark stub + Global Constraints (disputed never implemented), Task 4's `plan` column + Task 10/14 `freeTierExceeded`/usage meter.
- _Data model_ (`vendor_payment_config`, `transactions`, `refunds`, `kit_api_keys`) — Task 4, columns verbatim from the spec plus the one documented `plan` addition (called out both in Task 4's own "Note on scope" and again here).
- _Cross-kit HTTP API_ (5 endpoints, bearer auth, `vendor_id` trust, free-tier cap) — Tasks 10, 11, 12 (one task per endpoint group, matching the spec's table exactly); Task 8 for the bearer-secret mechanism; Task 10's cap check counts across all `kit_slug`s for a vendor (matches "counted across every kit" — the count query has no `kit_slug` filter).
- _Vendor-facing paykit app_ (config once, unified log, Pro reports, Pro refund entry, usage meter + nudge; no customer-facing pages) — Tasks 13, 14, 15 respectively. Confirmed no customer/public checkout page exists anywhere in this plan — the only public route is `/login`.
- _Adapter_ (`PaymentAdapter` interface, verbatim EMVCo move, dark auto-verify) — Task 5, interface signature matches the spec's TS block exactly (`kind: "paynow"`, `renderCheckout(config, ctx): { type: "qr"; payload: string }`).
- _Security/RLS_ (vendor RLS on config/transactions, service-role+bearer for the write API, no secrets in responses, Zod at every boundary) — Task 4 (RLS policies), Task 8 + Tasks 10–12 (service-role client, never a browser client, in every route), Global Constraints + Task 6/12 (no `secret_hash` ever selected; config GET returns only `payee_name`), Task 6 (`checkoutRequestSchema` etc.) + Task 13 (`vendorPaymentConfigInputSchema`).
- _Testing_ (unit+mutation `src/lib`, contract test, pgTAP RLS, DOM) — every new `src/lib/*.ts` file (paynow, adapter, schemas, api-schemas, tx-state, kit-auth, usage, transactions, revenue-report) has a co-located `*.test.ts` and falls inside `stryker.conf.json`'s `mutate` glob (Task 1) except `kit-auth.ts`, which is deliberately left in-scope too since its pure `hashApiKey` half benefits from mutation coverage even though `verifyKitAuth` is I/O-bound (same "advisory, non-blocking" tradeoff qkit accepts for mixed files). Contract test: Task 16. RLS: Task 17. DOM: Task 13 (`payment-config-form.dom.test.tsx`), Task 14 (`transaction-table.dom.test.tsx`), Task 15 (`refund-dialog.dom.test.tsx`) — covers exactly the three surfaces the spec names ("config form, tx log, refund action").
- _Out of scope_ — verified none of the 6 listed exclusions were built: no qkit modifications anywhere in this plan (only _reads_ qkit source as a porting reference); no `disputed` status anywhere in the `status` check constraint or `TxStatus` type (Task 4/7 only allow `pending`/`claimed`/`confirmed`); `autoVerify()` throws and is never called (Task 5); `refunds` has no money-movement code, purely a ledger insert (Task 15); no shopkit/other-kit UI touched; no PascalCase logo mark or brand pass (Task 1's `globals.css` uses the plain shadcn neutral palette, not a custom paykit theme).
- _Follow-ups_ (qkit cutover, shopkit wiring, brand pass, real auto-verify) — none started; `docs/DEPLOY.md` (Task 18) explicitly notes the key-minting script isn't run until that later cutover work exists.

No spec requirement was found without a corresponding task.

**2. Placeholder scan** — searched the plan for "TBD"/"TODO"/"implement later"/"add appropriate error handling"/"handle edge cases"/"similar to Task N" and found none. Every step that touches code includes the literal file contents (full files, not diffs-with-elision) — this was a deliberate choice over line-ranged edits so each task's implementer never has to reconstruct surrounding context. The two "port verbatim" steps (Task 5's `paynow.ts`/`paynow.test.ts`) are the one place code is copied rather than freshly written, which is the explicit, spec-mandated exception ("port them, don't redesign them") — flagged in-line in Task 5 itself, not left implicit.

**3. Type/name consistency** — traced every symbol from its defining task to every consuming task:

- `TxStatus` — defined in `src/lib/types.ts` (Task 4), re-exported from `src/lib/tx-state.ts` (Task 7), imported as `type TxStatus` in the claim/confirm routes (Task 11) and used inside `transactionStatusResponseSchema`/`toStatusResponse` (Task 6). No divergent name (no `TransactionStatus` typo anywhere).
- `VendorPlan` — defined Task 4, consumed by `freeTierExceeded` (Task 10) unchanged.
- `claimTransition`/`confirmTransition` — defined Task 7 with `{ status, changed }` return shape; both API routes (Task 11) destructure exactly that shape; no route reimplements the transition logic inline.
- `verifyKitAuth`/`hashApiKey` — defined Task 8; every `/api/v1/*` route (Tasks 10–12) imports and calls `verifyKitAuth(request)` the same way, checking `{ kitSlug }` truthiness; `create-kit-key.mjs` (Task 8) reimplements `hashApiKey`'s exact algorithm (sha256/hex/utf8) with an explicit comment explaining the duplication (script runs outside the Next bundle) rather than silently drifting.
- `toStatusResponse` — defined once in `src/lib/api-schemas.ts` (Task 6), reused verbatim (not reimplemented) by claim, confirm, and status routes (Tasks 11–12) and validated against by the contract test (Task 16).
- `TransactionTable`'s `{ transactions, isPro }` props — defined Task 14, Task 15 modifies the same file and explicitly keeps the same prop names (checked and called out in Task 15's step, since a later task changing an earlier task's public props is exactly the kind of drift this review is meant to catch).
- `paynowAdapter`/`autoVerify` — defined Task 5; `paynowAdapter.renderCheckout` consumed by the checkout route (Task 10) with the same `(config, { amountCents, orderRef })` signature as the spec's interface; `autoVerify` is intentionally imported by no other task.
- Two fixes made during this review (not left for a re-review): the reports page's "Upgrade to Pro" was a dead-end `Link` to a page with no purchase action — changed to plain text, and its now-unused `Link` import removed; `dashboard/page.tsx` was selecting an unused `payee_name` column — trimmed to `plan` only. Also corrected the RLS test's `throws_ok` → `throws_like` for a LIKE-pattern message match (a real pgTAP-usage bug, not a style nit), and fixed three miscounted "Expected: PASS, N tests" annotations (paynow.test.ts is 5 tests not 4; schemas+api-schemas combined is 12 not 10; the schema-guard test is 11 not "6 + 2").

---
