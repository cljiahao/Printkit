# Printer connectors — Phase 1 (core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the connector-agnostic core printkit needs before any brand driver exists: the printer data model, the printer catalog, server-side label rendering, the driver interfaces, job claim/dispatch/sweep, printer health, and the kit-facing printer status API.

**Architecture:** A `printers` row binds one physical printer to one `print_locations` row and names its connector and driver. Jobs stay in the existing `print_jobs` table; a `security definer` SQL function `claim_job` is the single place a job moves `queued` to `sent`, so pull and push connectors cannot double-print. Labels are built as a device-independent `LabelLayout` and rasterized to a 1-bit PNG on the server, so every connector prints the same content. Health is one column, `printers.last_seen_at`, written through one throttled helper.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Supabase (`@supabase/ssr`, service-role for writes), Zod, Vitest (node environment), `@napi-rs/canvas` for server-side rasterizing, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-20-printer-connectors-design.md`

## Global Constraints

- TypeScript strict. No `any`, no `@ts-ignore`.
- Validate all external input with Zod at the boundary.
- Authorization lives in RLS policies, not app code. Never widen a policy to make a query pass.
- Service-role client only in Server Actions and Route Handlers, never in client components.
- No secrets in `NEXT_PUBLIC_*`.
- Every `/api/v1/*` route verifies the caller's bearer secret with `verifyKitAuth` before touching the database.
- After editing the schema, update both `supabase/migrations/` and `src/lib/types.ts`.
- Comments: own-line only, no inline comments, no change-narration comments ("was", "added", dates, ticket refs). CI hard-gates this on added lines.
- No em dash (`—`) in user-facing copy in `.tsx` (JSX text, `aria-label`/`title`/`placeholder`/`label`/`content`/`description` attributes, `toast.*` arguments). Markdown docs are exempt.
- Conventional Commits for every commit. Never use `--no-verify`.
- Every folder whose files change needs its `README.md` updated in the same PR (CI `readme-freshness` gate).
- `CHANGELOG.md` must be updated in any PR touching `src/` (CI `changelog` gate).
- Job expiry window: 30 minutes. Health online window: 60 seconds. `last_seen_at` write throttle: 20 seconds. Claim ordering: `coalesce(requeued_at, created_at)`.
- Status values stay exactly `queued` → `sent` → `printed` | `failed`. `failure_reason` values: `expired`, `printer_offline`, `driver_error`, `device_reported_error`.

## File Structure

| File                                             | Responsibility                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `supabase/migrations/0008_printers_core.sql`     | New tables, `print_jobs` columns, `claim_job`, grants, RLS                      |
| `supabase/tests/rls.test.sql`                    | pgTAP: vendor isolation on `printers`, no access to credential tables           |
| `src/lib/types.ts`                               | Generated DB types, hand-updated for the new tables and columns                 |
| `src/lib/printer-catalog.ts`                     | Static catalog entries, lookup and `worksWithIpadAlone` helper                  |
| `src/lib/label-layout.ts`                        | `LabelLayout` type and `buildLabelLayout` (pure)                                |
| `src/lib/label-raster.ts`                        | `rasterizeLayout` (canvas to 1-bit PNG)                                         |
| `src/lib/label-render.ts`                        | Existing browser renderer, reduced to a re-export shim, then deleted in Phase 4 |
| `src/lib/connectors/types.ts`                    | Driver interfaces and shared result types                                       |
| `src/lib/connectors/registry.ts`                 | Driver id to driver-metadata lookup                                             |
| `src/lib/printers.ts`                            | `printers` reads/writes, health state, `touchPrinterSeen`                       |
| `src/lib/job-dispatch.ts`                        | `dispatchJob`, `claimJob`, `sweepLocation`                                      |
| `src/app/api/v1/print-locations/status/route.ts` | Kit-facing printer status endpoint                                              |

Each `src/lib/*.ts` file gets a sibling `*.test.ts`. Folder `README.md` files are updated in the task that adds files to that folder.

---

### Task 1: Schema and DB types

**Files:**

- Create: `supabase/migrations/0008_printers_core.sql`
- Modify: `src/lib/types.ts`
- Modify: `supabase/tests/rls.test.sql`
- Modify: `supabase/migrations/README.md`, `supabase/tests/README.md` (if present)

**Interfaces:**

- Consumes: existing `printkit.print_jobs`, `printkit.print_locations`.
- Produces: tables `printkit.printers`, `printkit.device_credentials`, `printkit.bridge_pairing_codes`; `print_jobs` columns `driver_ref`, `failure_reason`, `sent_at`, `requeued_at`; function `printkit.claim_job(p_location_id uuid, p_job_id uuid default null)` returning `setof printkit.print_jobs`; `Database["printkit"]["Tables"]["printers"]` and friends in `src/lib/types.ts`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0008_printers_core.sql`:

```sql
-- printers: one configured physical printer per print location. connector and
-- driver are copied from the static catalog at creation so job routing never
-- needs a catalog lookup in SQL.

alter table printkit.print_locations
  add constraint print_locations_id_vendor_key unique (id, vendor_id);

create table printkit.printers (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null unique references printkit.print_locations(id) on delete cascade,
  catalog_id text not null,
  connector text not null check (connector in ('cloud_poll', 'vendor_cloud', 'bridge')),
  driver text not null,
  display_name text not null,
  label_width_mm numeric not null,
  label_height_mm numeric not null,
  device_ref text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  constraint printers_location_vendor_fkey
    foreign key (location_id, vendor_id)
    references printkit.print_locations(id, vendor_id)
    on delete cascade
);
create index printers_vendor_idx on printkit.printers (vendor_id, created_at asc);

create table printkit.device_credentials (
  printer_id uuid primary key references printkit.printers(id) on delete cascade,
  kind text not null check (kind in ('cloudprnt_url_token', 'bridge_agent_token')),
  token_hash text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);
create unique index device_credentials_token_hash_idx
  on printkit.device_credentials (token_hash);

create table printkit.bridge_pairing_codes (
  code_hash text primary key,
  printer_id uuid not null references printkit.printers(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

alter table printkit.print_jobs add column driver_ref text;
alter table printkit.print_jobs add column failure_reason text;
alter table printkit.print_jobs add column sent_at timestamptz;
alter table printkit.print_jobs add column requeued_at timestamptz;

create index print_jobs_claimable_idx
  on printkit.print_jobs (location_id, status, created_at);

alter table printkit.printers enable row level security;
alter table printkit.device_credentials enable row level security;
alter table printkit.bridge_pairing_codes enable row level security;

create policy printers_vendor_select on printkit.printers
  for select using ((select auth.uid()) = vendor_id);

grant select on printkit.printers to authenticated;
grant all on printkit.printers to service_role;
grant all on printkit.device_credentials to service_role;
grant all on printkit.bridge_pairing_codes to service_role;

-- claim_job: the only path from 'queued' to 'sent'. skip locked plus the
-- single-row update means two concurrent callers can never claim the same job.
-- p_job_id null claims the oldest claimable job; a given p_job_id claims that
-- job or nothing.

create function printkit.claim_job(
  p_location_id uuid,
  p_job_id uuid default null
)
returns setof printkit.print_jobs
language sql
security definer
set search_path = printkit, public
as $$
  update printkit.print_jobs
  set status = 'sent', sent_at = now()
  where id = (
    select id from printkit.print_jobs
    where location_id = p_location_id
      and status = 'queued'
      and (p_job_id is null or id = p_job_id)
      and coalesce(requeued_at, created_at) > now() - interval '30 minutes'
    order by coalesce(requeued_at, created_at)
    limit 1
    for update skip locked
  )
  returning *;
$$;

revoke all on function printkit.claim_job(uuid, uuid) from public, anon, authenticated;
grant execute on function printkit.claim_job(uuid, uuid) to service_role;
```

- [ ] **Step 2: Update the DB types**

In `src/lib/types.ts`, inside `Database["printkit"]["Tables"]`, add the three tables following the existing shape (`Row`, `Insert`, `Update`, `Relationships: []`):

```ts
      printers: {
        Row: {
          catalog_id: string;
          connector: string;
          created_at: string;
          device_ref: string | null;
          display_name: string;
          driver: string;
          id: string;
          label_height_mm: number;
          label_width_mm: number;
          last_seen_at: string | null;
          location_id: string;
          vendor_id: string;
        };
        Insert: {
          catalog_id: string;
          connector: string;
          created_at?: string;
          device_ref?: string | null;
          display_name: string;
          driver: string;
          id?: string;
          label_height_mm: number;
          label_width_mm: number;
          last_seen_at?: string | null;
          location_id: string;
          vendor_id: string;
        };
        Update: {
          catalog_id?: string;
          connector?: string;
          created_at?: string;
          device_ref?: string | null;
          display_name?: string;
          driver?: string;
          id?: string;
          label_height_mm?: number;
          label_width_mm?: number;
          last_seen_at?: string | null;
          location_id?: string;
          vendor_id?: string;
        };
        Relationships: [];
      };
      device_credentials: {
        Row: {
          created_at: string;
          kind: string;
          printer_id: string;
          rotated_at: string | null;
          token_hash: string;
        };
        Insert: {
          created_at?: string;
          kind: string;
          printer_id: string;
          rotated_at?: string | null;
          token_hash: string;
        };
        Update: {
          created_at?: string;
          kind?: string;
          printer_id?: string;
          rotated_at?: string | null;
          token_hash?: string;
        };
        Relationships: [];
      };
      bridge_pairing_codes: {
        Row: {
          code_hash: string;
          expires_at: string;
          printer_id: string;
          used_at: string | null;
        };
        Insert: {
          code_hash: string;
          expires_at: string;
          printer_id: string;
          used_at?: string | null;
        };
        Update: {
          code_hash?: string;
          expires_at?: string;
          printer_id?: string;
          used_at?: string | null;
        };
        Relationships: [];
      };
```

Add the four new nullable columns to `print_jobs`'s `Row` (`driver_ref: string | null;`, `failure_reason: string | null;`, `sent_at: string | null;`, `requeued_at: string | null;`) and as optional fields on its `Insert` and `Update`.

If `Database["printkit"]["Functions"]` exists and is `{ [_ in never]: never }`, replace it with:

```ts
    Functions: {
      claim_job: {
        Args: { p_location_id: string; p_job_id?: string | null };
        Returns: Database["printkit"]["Tables"]["print_jobs"]["Row"][];
      };
    };
```

- [ ] **Step 3: Add pgTAP coverage**

Append to `supabase/tests/rls.test.sql`, following the file's existing style (adjust the plan count at the top of the file by 3):

```sql
select isnt_empty(
  $$ select 1 from pg_policies
     where schemaname = 'printkit' and tablename = 'printers'
       and policyname = 'printers_vendor_select' $$,
  'printers has a vendor select policy'
);

select is_empty(
  $$ select 1 from information_schema.role_table_grants
     where table_schema = 'printkit' and table_name = 'device_credentials'
       and grantee in ('anon', 'authenticated') $$,
  'device_credentials is not granted to anon or authenticated'
);

select is_empty(
  $$ select 1 from information_schema.role_table_grants
     where table_schema = 'printkit' and table_name = 'bridge_pairing_codes'
       and grantee in ('anon', 'authenticated') $$,
  'bridge_pairing_codes is not granted to anon or authenticated'
);
```

- [ ] **Step 4: Verify types compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no errors).

Applying the migration needs Docker and a local Supabase (`supabase start` then `supabase db push`); pgTAP runs with `supabase test db`. If Docker is unavailable in this environment, note it in the commit body and leave the DB run to the operator. Do not mark the plan blocked for it.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_printers_core.sql supabase/tests/rls.test.sql src/lib/types.ts supabase/migrations/README.md
git commit -m "feat(db): add printers, device credentials, pairing codes and claim_job"
```

---

### Task 2: Printer catalog

**Files:**

- Create: `src/lib/printer-catalog.ts`, `src/lib/printer-catalog.test.ts`
- Modify: `src/lib/README.md`

**Interfaces:**

- Consumes: nothing.
- Produces: `type ConnectorId = "cloud_poll" | "vendor_cloud" | "bridge"`; `type CatalogEntry`; `PRINTER_CATALOG: readonly CatalogEntry[]`; `getCatalogEntry(id: string): CatalogEntry | null`; `listCatalog(opts?: { includeDev?: boolean }): CatalogEntry[]`; `worksWithIpadAlone(entry: CatalogEntry): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/printer-catalog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  PRINTER_CATALOG,
  getCatalogEntry,
  listCatalog,
  worksWithIpadAlone,
} from "./printer-catalog";

describe("printer catalog", () => {
  it("exposes unique ids", () => {
    const ids = PRINTER_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("finds an entry by id and returns null for an unknown id", () => {
    expect(getCatalogEntry("feie-fp-n20h")?.connector).toBe("vendor_cloud");
    expect(getCatalogEntry("nope")).toBeNull();
  });

  it("treats a printer with no helper device as iPad-only capable", () => {
    const feie = getCatalogEntry("feie-fp-n20h");
    const niimbot = getCatalogEntry("niimbot-b1");
    expect(feie && worksWithIpadAlone(feie)).toBe(true);
    expect(niimbot && worksWithIpadAlone(niimbot)).toBe(false);
  });

  it("hides dev-only entries unless asked for them", () => {
    expect(listCatalog().some((entry) => entry.id === "virtual")).toBe(false);
    expect(
      listCatalog({ includeDev: true }).some((entry) => entry.id === "virtual"),
    ).toBe(true);
  });

  it("keeps every entry's label size inside its own width range", () => {
    for (const entry of PRINTER_CATALOG) {
      expect(entry.defaultLabelMm.width).toBeGreaterThanOrEqual(
        entry.labelWidthMm.min,
      );
      expect(entry.defaultLabelMm.width).toBeLessThanOrEqual(
        entry.labelWidthMm.max,
      );
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/printer-catalog.test.ts`
Expected: FAIL, cannot resolve `./printer-catalog`.

- [ ] **Step 3: Write the catalog**

Create `src/lib/printer-catalog.ts`:

```ts
export type ConnectorId = "cloud_poll" | "vendor_cloud" | "bridge";

export type CatalogEntry = {
  id: string;
  brand: string;
  model: string;
  connector: ConnectorId;
  driver: string;
  connectivity: Array<"4g" | "wifi" | "ethernet" | "bluetooth" | "usb">;
  helperDevice: "none" | "android_or_pi";
  labelWidthMm: { min: number; max: number };
  defaultLabelMm: { width: number; height: number };
  dpi: number;
  power: "mains" | "battery" | "mains_or_battery";
  setupEffort: 1 | 2 | 3;
  priceBand: "low" | "mid" | "high";
  recommended: boolean;
  hardwareVerified: boolean;
  devOnly: boolean;
  image: string;
  notes: string[];
};

export const PRINTER_CATALOG: readonly CatalogEntry[] = [
  {
    id: "feie-fp-n20h",
    brand: "Feie",
    model: "FP-N20H",
    connector: "vendor_cloud",
    driver: "feie",
    connectivity: ["4g", "usb"],
    helperDevice: "none",
    labelWidthMm: { min: 25, max: 56 },
    defaultLabelMm: { width: 50, height: 30 },
    dpi: 203,
    power: "mains",
    setupEffort: 1,
    priceBand: "low",
    recommended: true,
    hardwareVerified: false,
    devOnly: false,
    image: "/printers/feie-fp-n20h.jpg",
    notes: [
      "Has its own SIM card slot, so it prints without WiFi.",
      "Needs mains power.",
    ],
  },
  {
    id: "star-mc-label2",
    brand: "Star Micronics",
    model: "mC-Label2",
    connector: "cloud_poll",
    driver: "star-cloudprnt",
    connectivity: ["wifi", "ethernet", "bluetooth", "usb"],
    helperDevice: "none",
    labelWidthMm: { min: 25, max: 60 },
    defaultLabelMm: { width: 50, height: 30 },
    dpi: 300,
    power: "mains",
    setupEffort: 2,
    priceBand: "high",
    recommended: true,
    hardwareVerified: false,
    devOnly: false,
    image: "/printers/star-mc-label2.jpg",
    notes: [
      "Connects over your WiFi or a phone hotspot.",
      "Needs mains power.",
    ],
  },
  {
    id: "niimbot-b1",
    brand: "NIIMBOT",
    model: "B1",
    connector: "bridge",
    driver: "niimbot",
    connectivity: ["bluetooth"],
    helperDevice: "android_or_pi",
    labelWidthMm: { min: 20, max: 50 },
    defaultLabelMm: { width: 50, height: 30 },
    dpi: 203,
    power: "battery",
    setupEffort: 3,
    priceBand: "low",
    recommended: false,
    hardwareVerified: false,
    devOnly: false,
    image: "/printers/niimbot-b1.jpg",
    notes: [
      "Bluetooth only, so it needs an Android phone or a Raspberry Pi next to it.",
      "Runs on its own battery.",
    ],
  },
  {
    id: "virtual",
    brand: "Merqo",
    model: "Virtual printer",
    connector: "cloud_poll",
    driver: "star-cloudprnt",
    connectivity: ["wifi"],
    helperDevice: "none",
    labelWidthMm: { min: 25, max: 60 },
    defaultLabelMm: { width: 50, height: 30 },
    dpi: 203,
    power: "mains",
    setupEffort: 1,
    priceBand: "low",
    recommended: false,
    hardwareVerified: false,
    devOnly: true,
    image: "/printers/virtual.svg",
    notes: ["A test printer that prints to a browser page, for development."],
  },
];

export function getCatalogEntry(id: string): CatalogEntry | null {
  return PRINTER_CATALOG.find((entry) => entry.id === id) ?? null;
}

export function listCatalog(opts?: { includeDev?: boolean }): CatalogEntry[] {
  return PRINTER_CATALOG.filter(
    (entry) => !entry.devOnly || opts?.includeDev === true,
  );
}

export function worksWithIpadAlone(entry: CatalogEntry): boolean {
  return entry.helperDevice === "none";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/printer-catalog.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Update `src/lib/README.md` and commit**

Add a bullet under the file list describing `printer-catalog.ts` (static list of supported printer models, their connector and driver, and what a vendor needs to know to choose one).

```bash
git add src/lib/printer-catalog.ts src/lib/printer-catalog.test.ts src/lib/README.md
git commit -m "feat: add the static printer catalog"
```

---

### Task 3: Label layout builder

**Files:**

- Create: `src/lib/label-layout.ts`, `src/lib/label-layout.test.ts`
- Modify: `src/lib/README.md`

**Interfaces:**

- Consumes: `payloadField` from `src/lib/print-job-payload.ts`.
- Produces: `type LabelElement`, `type LabelLayout`, `buildLabelLayout(payload: Json, size: { widthMm: number; heightMm: number }): LabelLayout`, `MAX_LABEL_CHARS = 22`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/label-layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLabelLayout } from "./label-layout";

const size = { widthMm: 50, heightMm: 30 };

describe("buildLabelLayout", () => {
  it("places the order number and the customer name", () => {
    const layout = buildLabelLayout(
      { customer_name: "Ada", order_number: "67" },
      size,
    );

    expect(layout.widthMm).toBe(50);
    expect(layout.heightMm).toBe(30);
    const texts = layout.elements.map((el) =>
      el.kind === "text" ? el.text : "",
    );
    expect(texts).toContain("#67");
    expect(texts).toContain("Ada");
  });

  it("prints the order number larger than the name", () => {
    const layout = buildLabelLayout(
      { customer_name: "Ada", order_number: "67" },
      size,
    );
    const order = layout.elements.find(
      (el) => el.kind === "text" && el.text === "#67",
    );
    const name = layout.elements.find(
      (el) => el.kind === "text" && el.text === "Ada",
    );
    expect(order?.kind === "text" && order.size).toBe("xl");
    expect(name?.kind === "text" && name.size).toBe("md");
  });

  it("truncates an over-long name instead of overflowing the label", () => {
    const layout = buildLabelLayout(
      { customer_name: "a".repeat(40), order_number: "1" },
      size,
    );
    const name = layout.elements.find(
      (el) => el.kind === "text" && el.text !== "#1",
    );
    expect(name?.kind === "text" && name.text.length).toBe(22);
    expect(name?.kind === "text" && name.text.endsWith("…")).toBe(true);
  });

  it("falls back to readable placeholders on a missing payload", () => {
    const layout = buildLabelLayout({}, size);
    const texts = layout.elements.map((el) =>
      el.kind === "text" ? el.text : "",
    );
    expect(texts).toContain("#?");
    expect(texts).toContain("Customer");
  });

  it("keeps every element inside the label bounds", () => {
    const layout = buildLabelLayout(
      { customer_name: "Ada", order_number: "67" },
      size,
    );
    for (const el of layout.elements) {
      expect(el.xMm).toBeGreaterThanOrEqual(0);
      expect(el.xMm).toBeLessThanOrEqual(layout.widthMm);
      expect(el.yMm).toBeGreaterThanOrEqual(0);
      expect(el.yMm).toBeLessThanOrEqual(layout.heightMm);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/label-layout.test.ts`
Expected: FAIL, cannot resolve `./label-layout`.

- [ ] **Step 3: Write the layout builder**

Create `src/lib/label-layout.ts`:

```ts
import { payloadField } from "@/lib/print-job-payload";
import type { Json } from "@/lib/types";

export const MAX_LABEL_CHARS = 22;

export type LabelElement =
  | {
      kind: "text";
      text: string;
      xMm: number;
      yMm: number;
      size: "sm" | "md" | "lg" | "xl";
      bold: boolean;
      align: "left" | "center" | "right";
    }
  | { kind: "qr"; value: string; xMm: number; yMm: number; sizeMm: number };

export type LabelLayout = {
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
};

function truncate(text: string): string {
  return text.length > MAX_LABEL_CHARS
    ? `${text.slice(0, MAX_LABEL_CHARS - 1)}…`
    : text;
}

/**
 * Device-independent label content. Every connector renders this same
 * layout: raster drivers through rasterizeLayout, markup drivers by
 * translating it into their own tags.
 */
export function buildLabelLayout(
  payload: Json,
  size: { widthMm: number; heightMm: number },
): LabelLayout {
  const name = truncate(
    payloadField(payload, "customer_name", "").trim() || "Customer",
  );
  const orderNumber = payloadField(payload, "order_number", "").trim() || "?";

  return {
    widthMm: size.widthMm,
    heightMm: size.heightMm,
    elements: [
      {
        kind: "text",
        text: `#${orderNumber}`,
        xMm: size.widthMm / 2,
        yMm: size.heightMm * 0.42,
        size: "xl",
        bold: true,
        align: "center",
      },
      {
        kind: "text",
        text: name,
        xMm: size.widthMm / 2,
        yMm: size.heightMm * 0.75,
        size: "md",
        bold: false,
        align: "center",
      },
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/label-layout.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Update `src/lib/README.md` and commit**

```bash
git add src/lib/label-layout.ts src/lib/label-layout.test.ts src/lib/README.md
git commit -m "feat: add the device-independent label layout builder"
```

---

### Task 4: Server-side rasterizer

**Files:**

- Create: `src/lib/label-raster.ts`, `src/lib/label-raster.test.ts`
- Create: `src/assets/fonts/NotoSansSC-Bold.ttf`, `src/assets/fonts/NotoSansSC-Regular.ttf`, `src/assets/fonts/README.md`
- Modify: `package.json` (add `@napi-rs/canvas`), `src/lib/README.md`

**Interfaces:**

- Consumes: `LabelLayout` from Task 3.
- Produces: `rasterizeLayout(layout: LabelLayout, dpi: number): Promise<Buffer>` returning PNG bytes; `mmToPx(mm: number, dpi: number): number`.

- [ ] **Step 1: Add the dependency and fonts**

Run: `pnpm add @napi-rs/canvas`

Download Noto Sans SC (SIL Open Font License, covers Latin and Chinese) Regular and Bold static TTFs into `src/assets/fonts/`. Create `src/assets/fonts/README.md` stating the font name, version, licence (OFL), the source URL, and that the rasterizer registers these files explicitly because Vercel functions have no usable system fonts.

- [ ] **Step 2: Write the failing test**

Create `src/lib/label-raster.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLabelLayout } from "./label-layout";
import { rasterizeLayout, mmToPx } from "./label-raster";

const layout = buildLabelLayout(
  { customer_name: "Ada", order_number: "67" },
  { widthMm: 50, heightMm: 30 },
);

describe("mmToPx", () => {
  it("converts millimetres to dots at the given dpi", () => {
    expect(mmToPx(25.4, 203)).toBe(203);
    expect(mmToPx(50, 203)).toBe(399);
  });
});

describe("rasterizeLayout", () => {
  it("returns PNG bytes", async () => {
    const png = await rasterizeLayout(layout, 203);
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it("sizes the image from the label size and dpi", async () => {
    const png = await rasterizeLayout(layout, 203);
    expect(png.readUInt32BE(16)).toBe(mmToPx(50, 203));
    expect(png.readUInt32BE(20)).toBe(mmToPx(30, 203));
  });

  it("is deterministic for the same layout", async () => {
    const a = await rasterizeLayout(layout, 203);
    const b = await rasterizeLayout(layout, 203);
    expect(a.equals(b)).toBe(true);
  });

  it("renders different content to different bytes", async () => {
    const other = buildLabelLayout(
      { customer_name: "Bo", order_number: "68" },
      { widthMm: 50, heightMm: 30 },
    );
    const a = await rasterizeLayout(layout, 203);
    const b = await rasterizeLayout(other, 203);
    expect(a.equals(b)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/label-raster.test.ts`
Expected: FAIL, cannot resolve `./label-raster`.

- [ ] **Step 4: Write the rasterizer**

Create `src/lib/label-raster.ts`:

```ts
import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import type { LabelLayout } from "@/lib/label-layout";

const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");
const FONT_FAMILY = "PrintkitLabel";

let fontsRegistered = false;

function registerFonts(): void {
  if (fontsRegistered) return;
  GlobalFonts.registerFromPath(
    path.join(FONT_DIR, "NotoSansSC-Regular.ttf"),
    FONT_FAMILY,
  );
  GlobalFonts.registerFromPath(
    path.join(FONT_DIR, "NotoSansSC-Bold.ttf"),
    `${FONT_FAMILY} Bold`,
  );
  fontsRegistered = true;
}

const SIZE_SCALE: Record<"sm" | "md" | "lg" | "xl", number> = {
  sm: 0.08,
  md: 0.12,
  lg: 0.18,
  xl: 0.3,
};

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

/**
 * Draws a layout to a monochrome PNG. Every pixel is forced to pure black
 * or pure white, since thermal printers have no grey.
 */
export async function rasterizeLayout(
  layout: LabelLayout,
  dpi: number,
): Promise<Buffer> {
  registerFonts();

  const width = mmToPx(layout.widthMm, dpi);
  const height = mmToPx(layout.heightMm, dpi);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "black";
  ctx.textBaseline = "middle";

  for (const element of layout.elements) {
    if (element.kind !== "text") continue;
    const fontPx = Math.round(height * SIZE_SCALE[element.size]);
    ctx.font = `${fontPx}px "${FONT_FAMILY}${element.bold ? " Bold" : ""}"`;
    ctx.textAlign = element.align;
    ctx.fillText(
      element.text,
      mmToPx(element.xMm, dpi),
      mmToPx(element.yMm, dpi),
    );
  }

  const image = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < image.data.length; i += 4) {
    const luminance =
      0.299 * image.data[i] +
      0.587 * image.data[i + 1] +
      0.114 * image.data[i + 2];
    const value = luminance < 128 ? 0 : 255;
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  return canvas.toBuffer("image/png");
}
```

QR elements are not drawn yet: no job type produces one in Phase 1. The loop skips them rather than failing, and the task that introduces a QR payload adds the drawing code and its own test.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/label-raster.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Update `src/lib/README.md` and commit**

```bash
git add package.json pnpm-lock.yaml src/assets/fonts src/lib/label-raster.ts src/lib/label-raster.test.ts src/lib/README.md
git commit -m "feat: rasterize label layouts to monochrome PNG on the server"
```

---

### Task 5: Driver interfaces and registry

**Files:**

- Create: `src/lib/connectors/types.ts`, `src/lib/connectors/registry.ts`, `src/lib/connectors/registry.test.ts`, `src/lib/connectors/README.md`

**Interfaces:**

- Consumes: `ConnectorId`, `PRINTER_CATALOG` (Task 2); `LabelLayout` (Task 3).
- Produces: `type RenderedJob`, `type DriverBase`, `type CloudPollDriver`, `type VendorCloudDriver`, `type BridgeDriver`, `type DriverMeta`; `registerDriver(meta: DriverMeta): void`; `getDriverMeta(id: string): DriverMeta | null`; `listDriverMeta(): DriverMeta[]`; `isDriverAvailable(id: string): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/connectors/registry.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  registerDriver,
  getDriverMeta,
  listDriverMeta,
  isDriverAvailable,
  resetDriverRegistry,
} from "./registry";

describe("driver registry", () => {
  beforeEach(() => {
    resetDriverRegistry();
  });

  it("returns null for an unregistered driver", () => {
    expect(getDriverMeta("star-cloudprnt")).toBeNull();
    expect(isDriverAvailable("star-cloudprnt")).toBe(false);
  });

  it("finds a registered driver by id", () => {
    registerDriver({
      id: "star-cloudprnt",
      connector: "cloud_poll",
      outputFormat: "png",
    });

    expect(getDriverMeta("star-cloudprnt")).toEqual({
      id: "star-cloudprnt",
      connector: "cloud_poll",
      outputFormat: "png",
    });
    expect(isDriverAvailable("star-cloudprnt")).toBe(true);
    expect(listDriverMeta()).toHaveLength(1);
  });

  it("rejects a second driver registered under the same id", () => {
    registerDriver({
      id: "feie",
      connector: "vendor_cloud",
      outputFormat: "markup",
    });

    expect(() =>
      registerDriver({
        id: "feie",
        connector: "vendor_cloud",
        outputFormat: "markup",
      }),
    ).toThrow(/already registered/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/connectors/registry.test.ts`
Expected: FAIL, cannot resolve `./registry`.

- [ ] **Step 3: Write the interfaces**

Create `src/lib/connectors/types.ts`:

```ts
import type { ConnectorId } from "@/lib/printer-catalog";
import type { LabelLayout } from "@/lib/label-layout";

export type OutputFormat = "png" | "markup";

export type RenderedJob = {
  jobId: string;
  layout: LabelLayout;
  dpi: number;
};

export type DriverMeta = {
  id: string;
  connector: ConnectorId;
  outputFormat: OutputFormat;
};

export type PollInfo = {
  deviceRef: string | null;
  ready: boolean;
};

export type ConfirmResult = {
  jobId: string | null;
  outcome: "printed" | "failed";
};

export type SendResult =
  { ok: true; driverRef: string } | { ok: false; error: string };

export type RegisterResult =
  { ok: true; deviceRef: string } | { ok: false; error: string };

export interface CloudPollDriver extends DriverMeta {
  parsePoll(request: Request): Promise<PollInfo>;
  pollResponse(job: { id: string } | null): Response;
  jobResponse(body: Buffer, contentType: string): Response;
  parseConfirmation(request: Request): ConfirmResult;
}

export interface VendorCloudDriver extends DriverMeta {
  registerPrinter(input: Record<string, string>): Promise<RegisterResult>;
  unregisterPrinter(deviceRef: string): Promise<void>;
  send(deviceRef: string, job: RenderedJob): Promise<SendResult>;
  queryJob(driverRef: string): Promise<"pending" | "printed" | "failed">;
  queryPrinter(deviceRef: string): Promise<"online" | "offline" | "unknown">;
}

export interface BridgeDriver extends DriverMeta {
  print(
    png: Uint8Array,
    opts: { model: string; quantity: number },
  ): Promise<void>;
}
```

Create `src/lib/connectors/registry.ts`:

```ts
import type { DriverMeta } from "@/lib/connectors/types";

const registry = new Map<string, DriverMeta>();

/**
 * Drivers register themselves at module load. The registry only holds
 * metadata; the protocol code lives in each driver's own module and is
 * imported by that connector's routes.
 */
export function registerDriver(meta: DriverMeta): void {
  if (registry.has(meta.id)) {
    throw new Error(`Driver ${meta.id} is already registered`);
  }
  registry.set(meta.id, meta);
}

export function getDriverMeta(id: string): DriverMeta | null {
  return registry.get(id) ?? null;
}

export function listDriverMeta(): DriverMeta[] {
  return [...registry.values()];
}

export function isDriverAvailable(id: string): boolean {
  return registry.has(id);
}

/**
 * Test-only: clears registrations between cases.
 */
export function resetDriverRegistry(): void {
  registry.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/connectors/registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `src/lib/connectors/README.md` and commit**

The README states: one folder per connector is added in later phases; `types.ts` holds the three driver interfaces; `registry.ts` maps driver id to metadata so the catalog can tell which drivers are actually built.

```bash
git add src/lib/connectors src/lib/README.md
git commit -m "feat: add connector driver interfaces and registry"
```

---

### Task 6: Printers data layer and health

**Files:**

- Create: `src/lib/printers.ts`, `src/lib/printers.test.ts`
- Modify: `src/lib/README.md`

**Interfaces:**

- Consumes: `createServiceClient` (`@/lib/supabase/server`), `getCatalogEntry` (Task 2).
- Produces: `type PrinterRow`; `type PrinterState = "online" | "offline" | "not_set_up"`; `printerState(lastSeenAt: string | null, now?: Date): PrinterState`; `getPrinterByLocation(locationId: string): Promise<PrinterRow | null>`; `getPrinterByTokenHash(tokenHash: string): Promise<PrinterRow | null>`; `touchPrinterSeen(printer: PrinterRow): Promise<void>`; `HEALTH_ONLINE_MS = 60_000`; `SEEN_WRITE_THROTTLE_MS = 20_000`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/printers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const updateMock = vi.fn();
const selectMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: () => ({
        select: selectMock,
        update: updateMock,
      }),
    }),
}));

import {
  printerState,
  touchPrinterSeen,
  getPrinterByLocation,
  type PrinterRow,
} from "./printers";

const printer: PrinterRow = {
  id: "printer-1",
  vendor_id: "vendor-1",
  location_id: "loc-1",
  catalog_id: "feie-fp-n20h",
  connector: "vendor_cloud",
  driver: "feie",
  display_name: "Feie FP-N20H",
  label_width_mm: 50,
  label_height_mm: 30,
  device_ref: "SN123",
  last_seen_at: null,
  created_at: "2026-09-20T00:00:00.000Z",
};

describe("printerState", () => {
  const now = new Date("2026-09-20T10:00:00.000Z");

  it("is online inside the 60 second window", () => {
    expect(printerState("2026-09-20T09:59:30.000Z", now)).toBe("online");
  });

  it("is offline outside the window", () => {
    expect(printerState("2026-09-20T09:58:00.000Z", now)).toBe("offline");
  });

  it("is offline when the printer has never been seen", () => {
    expect(printerState(null, now)).toBe("offline");
  });
});

describe("touchPrinterSeen", () => {
  beforeEach(() => {
    updateMock.mockReset();
    updateMock.mockReturnValue({ eq: () => Promise.resolve({ error: null }) });
  });

  it("writes when the printer has never been seen", async () => {
    await touchPrinterSeen(printer);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("skips the write inside the throttle window", async () => {
    await touchPrinterSeen({
      ...printer,
      last_seen_at: new Date(Date.now() - 5_000).toISOString(),
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("writes again once the throttle window has passed", async () => {
    await touchPrinterSeen({
      ...printer,
      last_seen_at: new Date(Date.now() - 25_000).toISOString(),
    });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});

describe("getPrinterByLocation", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("returns null when the location has no printer", async () => {
    selectMock.mockReturnValue({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
    });
    expect(await getPrinterByLocation("loc-1")).toBeNull();
  });

  it("returns the printer row", async () => {
    selectMock.mockReturnValue({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: printer, error: null }),
      }),
    });
    expect(await getPrinterByLocation("loc-1")).toEqual(printer);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/printers.test.ts`
Expected: FAIL, cannot resolve `./printers`.

- [ ] **Step 3: Write the data layer**

Create `src/lib/printers.ts`:

```ts
import { createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types";

export type PrinterRow = Database["printkit"]["Tables"]["printers"]["Row"];

export type PrinterState = "online" | "offline" | "not_set_up";

export const HEALTH_ONLINE_MS = 60_000;
export const SEEN_WRITE_THROTTLE_MS = 20_000;

/**
 * A printer counts as online while its last_seen_at is inside the health
 * window. "not_set_up" is for a location with no printer row at all, which
 * this function never sees, so callers map that case themselves.
 */
export function printerState(
  lastSeenAt: string | null,
  now: Date = new Date(),
): PrinterState {
  if (!lastSeenAt) return "offline";
  const age = now.getTime() - new Date(lastSeenAt).getTime();
  return age <= HEALTH_ONLINE_MS ? "online" : "offline";
}

export async function getPrinterByLocation(
  locationId: string,
): Promise<PrinterRow | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("printers")
    .select("*")
    .eq("location_id", locationId)
    .maybeSingle();

  if (error) {
    console.error("getPrinterByLocation failed", error.message);
    return null;
  }
  return data ?? null;
}

export async function getPrinterByTokenHash(
  tokenHash: string,
): Promise<PrinterRow | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("device_credentials")
    .select("printers(*)")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("getPrinterByTokenHash failed", error.message);
    return null;
  }
  const joined = (data as { printers: PrinterRow | null }).printers;
  return joined ?? null;
}

/**
 * Health heartbeat. Throttled so a printer polling every few seconds does
 * not write a row on every request.
 */
export async function touchPrinterSeen(printer: PrinterRow): Promise<void> {
  const last = printer.last_seen_at
    ? new Date(printer.last_seen_at).getTime()
    : 0;
  if (Date.now() - last < SEEN_WRITE_THROTTLE_MS) return;

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("printers")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", printer.id);

  if (error) console.error("touchPrinterSeen failed", error.message);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/printers.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Update `src/lib/README.md` and commit**

```bash
git add src/lib/printers.ts src/lib/printers.test.ts src/lib/README.md
git commit -m "feat: add printer reads and the shared health signal"
```

---

### Task 7: Claim, sweep and dispatch

**Files:**

- Create: `src/lib/job-dispatch.ts`, `src/lib/job-dispatch.test.ts`
- Modify: `src/lib/print-jobs.ts`, `src/lib/print-jobs.test.ts`, `src/lib/README.md`

**Interfaces:**

- Consumes: `claim_job` (Task 1), `getPrinterByLocation` (Task 6), `updatePrintJobStatus` (existing `src/lib/print-jobs.ts`).
- Produces: `JOB_EXPIRY_MS = 1_800_000`; `CONFIRM_TIMEOUT_MS = 120_000`; `claimJob(locationId: string, jobId?: string): Promise<ClaimedJob | null>`; `sweepLocation(locationId: string): Promise<void>`; `dispatchJob(jobId: string): Promise<void>`; `type ClaimedJob = Database["printkit"]["Tables"]["print_jobs"]["Row"]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/job-dispatch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const selectMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      rpc: rpcMock,
      from: () => ({ select: selectMock }),
    }),
}));

const updatePrintJobStatusMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/print-jobs", () => ({
  updatePrintJobStatus: (...args: unknown[]) =>
    updatePrintJobStatusMock(...args),
}));

const getPrinterByLocationMock = vi.fn();
vi.mock("@/lib/printers", () => ({
  getPrinterByLocation: (...args: unknown[]) =>
    getPrinterByLocationMock(...args),
}));

import { claimJob, sweepLocation, dispatchJob } from "./job-dispatch";

const job = {
  id: "job-1",
  location_id: "loc-1",
  status: "sent",
  vendor_id: "vendor-1",
};

beforeEach(() => {
  rpcMock.mockReset();
  selectMock.mockReset();
  updatePrintJobStatusMock.mockClear();
  getPrinterByLocationMock.mockReset();
});

describe("claimJob", () => {
  it("returns the claimed job", async () => {
    rpcMock.mockResolvedValue({ data: [job], error: null });

    expect(await claimJob("loc-1")).toEqual(job);
    expect(rpcMock).toHaveBeenCalledWith("claim_job", {
      p_location_id: "loc-1",
      p_job_id: null,
    });
  });

  it("passes a specific job id through", async () => {
    rpcMock.mockResolvedValue({ data: [job], error: null });

    await claimJob("loc-1", "job-1");
    expect(rpcMock).toHaveBeenCalledWith("claim_job", {
      p_location_id: "loc-1",
      p_job_id: "job-1",
    });
  });

  it("returns null when nothing was claimable", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    expect(await claimJob("loc-1")).toBeNull();
  });

  it("returns null and does not throw on a DB error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await claimJob("loc-1")).toBeNull();
  });
});

describe("sweepLocation", () => {
  it("fails jobs that outlived the expiry window", async () => {
    const old = new Date(Date.now() - 31 * 60_000).toISOString();
    selectMock.mockReturnValue({
      eq: () => ({
        in: () =>
          Promise.resolve({
            data: [
              {
                id: "job-old",
                status: "queued",
                created_at: old,
                requeued_at: null,
                sent_at: null,
              },
            ],
            error: null,
          }),
      }),
    });

    await sweepLocation("loc-1");

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-old",
      "failed",
      "expired",
    );
  });

  it("fails sent jobs that were never confirmed", async () => {
    const sent = new Date(Date.now() - 3 * 60_000).toISOString();
    selectMock.mockReturnValue({
      eq: () => ({
        in: () =>
          Promise.resolve({
            data: [
              {
                id: "job-stuck",
                status: "sent",
                created_at: sent,
                requeued_at: null,
                sent_at: sent,
              },
            ],
            error: null,
          }),
      }),
    });

    await sweepLocation("loc-1");

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-stuck",
      "failed",
      "device_reported_error",
    );
  });

  it("leaves fresh jobs alone", async () => {
    const fresh = new Date().toISOString();
    selectMock.mockReturnValue({
      eq: () => ({
        in: () =>
          Promise.resolve({
            data: [
              {
                id: "job-new",
                status: "queued",
                created_at: fresh,
                requeued_at: null,
                sent_at: null,
              },
            ],
            error: null,
          }),
      }),
    });

    await sweepLocation("loc-1");
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });
});

describe("dispatchJob", () => {
  it("does nothing for a pull connector", async () => {
    selectMock.mockReturnValue({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({ data: { ...job, status: "queued" }, error: null }),
      }),
    });
    getPrinterByLocationMock.mockResolvedValue({
      connector: "cloud_poll",
      driver: "star-cloudprnt",
    });

    await dispatchJob("job-1");
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("does nothing when the job has no location yet", async () => {
    selectMock.mockReturnValue({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({
            data: { ...job, location_id: null, status: "queued" },
            error: null,
          }),
      }),
    });

    await dispatchJob("job-1");
    expect(getPrinterByLocationMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/job-dispatch.test.ts`
Expected: FAIL, cannot resolve `./job-dispatch`.

- [ ] **Step 3: Write the dispatcher**

Create `src/lib/job-dispatch.ts`:

```ts
import { createServiceClient } from "@/lib/supabase/server";
import { updatePrintJobStatus } from "@/lib/print-jobs";
import { getPrinterByLocation } from "@/lib/printers";
import type { Database } from "@/lib/types";

export type ClaimedJob = Database["printkit"]["Tables"]["print_jobs"]["Row"];

export const JOB_EXPIRY_MS = 1_800_000;
export const CONFIRM_TIMEOUT_MS = 120_000;

/**
 * The only path from 'queued' to 'sent'. Delegates to the SQL function so
 * the row lock and the update are one statement.
 */
export async function claimJob(
  locationId: string,
  jobId?: string,
): Promise<ClaimedJob | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase.rpc("claim_job", {
    p_location_id: locationId,
    p_job_id: jobId ?? null,
  });

  if (error) {
    console.error("claimJob failed", error.message);
    return null;
  }
  const rows = (data ?? []) as ClaimedJob[];
  return rows[0] ?? null;
}

/**
 * Idempotent timeout pass for one location, run at the start of every pull,
 * status read and vendor_cloud dispatch. There is no scheduler.
 */
export async function sweepLocation(locationId: string): Promise<void> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("print_jobs")
    .select("id, status, created_at, requeued_at, sent_at")
    .eq("location_id", locationId)
    .in("status", ["queued", "sent"]);

  if (error) {
    console.error("sweepLocation failed", error.message);
    return;
  }

  const now = Date.now();
  for (const row of data ?? []) {
    if (row.status === "queued") {
      const since = new Date(row.requeued_at ?? row.created_at).getTime();
      if (now - since > JOB_EXPIRY_MS) {
        await updatePrintJobStatus(row.id, "failed", "expired");
      }
      continue;
    }
    if (row.status === "sent" && row.sent_at) {
      const since = new Date(row.sent_at).getTime();
      if (now - since > CONFIRM_TIMEOUT_MS) {
        await updatePrintJobStatus(row.id, "failed", "device_reported_error");
      }
    }
  }
}

/**
 * Push connectors send immediately; pull connectors wait for the device to
 * ask. Never throws: a dispatch failure must not fail job creation.
 */
export async function dispatchJob(jobId: string): Promise<void> {
  const supabase = await createServiceClient();
  const { data: job, error } = await supabase
    .from("print_jobs")
    .select("id, location_id, status")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !job || !job.location_id) return;

  const printer = await getPrinterByLocation(job.location_id);
  if (!printer) return;
  if (printer.connector !== "vendor_cloud") return;

  await sweepLocation(job.location_id);
}
```

The `vendor_cloud` branch stops at the sweep in this phase: no driver is registered yet, so there is nothing to send to. Task 3 of the Phase 3 plan replaces that line with the driver call.

- [ ] **Step 4: Extend `updatePrintJobStatus` with a failure reason**

In `src/lib/print-jobs.ts`, change the signature to
`updatePrintJobStatus(jobId: string, status: PrintJobStatus, failureReason?: string)` and include `failure_reason: failureReason ?? null` in the update payload. Keep every existing behaviour, including the `printed_at` write and the fire-and-forget `notifyKitPrintStatus` call.

Add to `src/lib/print-jobs.test.ts`:

```ts
it("records a failure reason when one is given", async () => {
  updateMock.mockReturnValue({
    eq: () => ({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: { source_kit: "qkit", source_ref: "order-1" },
            error: null,
          }),
      }),
    }),
  });

  await updatePrintJobStatus("job-1", "failed", "expired");

  expect(updateMock).toHaveBeenCalledWith(
    expect.objectContaining({ status: "failed", failure_reason: "expired" }),
  );
});
```

- [ ] **Step 5: Call `dispatchJob` from job creation**

In `src/lib/print-jobs.ts`, at the end of `createPrintJob`'s success path, call the dispatcher without awaiting its result and without letting it throw:

```ts
void dispatchJob(data.id).catch((err: unknown) => {
  console.error("dispatchJob failed", err);
});

return { ok: true, id: data.id };
```

Import it with `import { dispatchJob } from "@/lib/job-dispatch";`. In `src/lib/print-jobs.test.ts`, add `vi.mock("@/lib/job-dispatch", () => ({ dispatchJob: vi.fn().mockResolvedValue(undefined) }));` next to the existing mocks so the existing cases keep passing.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: PASS, including the existing `print-jobs` cases.

- [ ] **Step 7: Update `src/lib/README.md` and commit**

```bash
git add src/lib/job-dispatch.ts src/lib/job-dispatch.test.ts src/lib/print-jobs.ts src/lib/print-jobs.test.ts src/lib/README.md
git commit -m "feat: add job claim, lazy sweep and dispatch"
```

---

### Task 8: Kit-facing printer status API

**Files:**

- Create: `src/app/api/v1/print-locations/status/route.ts`, `src/app/api/v1/print-locations/status/route.test.ts`, `src/app/api/v1/print-locations/status/README.md`
- Modify: `src/app/api/v1/README.md` (if present), `CHANGELOG.md`

**Interfaces:**

- Consumes: `verifyKitAuth` (`@/lib/kit-auth`), `resolveActiveLocation` (`@/lib/print-locations`), `getPrinterByLocation`, `printerState` (Task 6), `sweepLocation` (Task 7), `getCatalogEntry` (Task 2).
- Produces: `GET /api/v1/print-locations/status?source_ref=<ref>` returning `{ printer: null }` or `{ printer: { display_name, catalog_id, connector, state, last_seen_at, hardware_verified } }`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/v1/print-locations/status/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyKitAuthMock = vi.fn();
vi.mock("@/lib/kit-auth", () => ({
  verifyKitAuth: (...args: unknown[]) => verifyKitAuthMock(...args),
}));

const resolveActiveLocationMock = vi.fn();
vi.mock("@/lib/print-locations", () => ({
  resolveActiveLocation: (...args: unknown[]) =>
    resolveActiveLocationMock(...args),
}));

const getPrinterByLocationMock = vi.fn();
vi.mock("@/lib/printers", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/printers")>("@/lib/printers");
  return {
    ...actual,
    getPrinterByLocation: (...args: unknown[]) =>
      getPrinterByLocationMock(...args),
  };
});

const sweepLocationMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/job-dispatch", () => ({
  sweepLocation: (...args: unknown[]) => sweepLocationMock(...args),
}));

import { GET } from "./route";

function request(ref = "booth-1"): Request {
  return new Request(
    `https://printkit.test/api/v1/print-locations/status?source_ref=${ref}`,
  );
}

beforeEach(() => {
  verifyKitAuthMock.mockReset().mockResolvedValue({ kitSlug: "qkit" });
  resolveActiveLocationMock.mockReset();
  getPrinterByLocationMock.mockReset();
  sweepLocationMock.mockClear();
});

describe("GET /api/v1/print-locations/status", () => {
  it("rejects an unauthenticated caller", async () => {
    verifyKitAuthMock.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("rejects a missing source_ref", async () => {
    const res = await GET(
      new Request("https://printkit.test/api/v1/print-locations/status"),
    );
    expect(res.status).toBe(400);
  });

  it("returns a null printer for an unknown location", async () => {
    resolveActiveLocationMock.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ printer: null });
  });

  it("returns a null printer when the location has none", async () => {
    resolveActiveLocationMock.mockResolvedValue({
      id: "loc-1",
      vendorId: "vendor-1",
    });
    getPrinterByLocationMock.mockResolvedValue(null);
    expect(await (await GET(request())).json()).toEqual({ printer: null });
  });

  it("reports the printer and its live state", async () => {
    resolveActiveLocationMock.mockResolvedValue({
      id: "loc-1",
      vendorId: "vendor-1",
    });
    getPrinterByLocationMock.mockResolvedValue({
      id: "printer-1",
      display_name: "Feie FP-N20H",
      catalog_id: "feie-fp-n20h",
      connector: "vendor_cloud",
      last_seen_at: new Date().toISOString(),
    });

    const body = await (await GET(request())).json();
    expect(body.printer).toMatchObject({
      display_name: "Feie FP-N20H",
      catalog_id: "feie-fp-n20h",
      connector: "vendor_cloud",
      state: "online",
      hardware_verified: false,
    });
    expect(sweepLocationMock).toHaveBeenCalledWith("loc-1");
  });

  it("scopes the lookup to the calling kit", async () => {
    resolveActiveLocationMock.mockResolvedValue(null);
    await GET(request("booth-9"));
    expect(resolveActiveLocationMock).toHaveBeenCalledWith("qkit", "booth-9");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/api/v1/print-locations/status/route.test.ts`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Write the route**

Create `src/app/api/v1/print-locations/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyKitAuth } from "@/lib/kit-auth";
import { resolveActiveLocation } from "@/lib/print-locations";
import { getPrinterByLocation, printerState } from "@/lib/printers";
import { sweepLocation } from "@/lib/job-dispatch";
import { getCatalogEntry } from "@/lib/printer-catalog";

const querySchema = z.object({ source_ref: z.string().min(1) });

export async function GET(request: Request) {
  const auth = await verifyKitAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    source_ref: url.searchParams.get("source_ref") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "source_ref is required" },
      { status: 400 },
    );
  }

  const location = await resolveActiveLocation(
    auth.kitSlug,
    parsed.data.source_ref,
  );
  if (!location) {
    return NextResponse.json({ printer: null });
  }

  await sweepLocation(location.id);

  const printer = await getPrinterByLocation(location.id);
  if (!printer) {
    return NextResponse.json({ printer: null });
  }

  return NextResponse.json({
    printer: {
      display_name: printer.display_name,
      catalog_id: printer.catalog_id,
      connector: printer.connector,
      state: printerState(printer.last_seen_at),
      last_seen_at: printer.last_seen_at,
      hardware_verified:
        getCatalogEntry(printer.catalog_id)?.hardwareVerified ?? false,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/api/v1/print-locations/status/route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the route README and update the changelog**

`src/app/api/v1/print-locations/status/README.md` states: purpose (a calling kit asks whether a booth's printer is set up and reachable), auth (bearer kit secret, same as the other `/api/v1` routes), the query parameter, both response shapes, and that it runs the lazy sweep for that location as a side effect.

Add to `CHANGELOG.md` under `## [Unreleased]` / `### Added`: printer records, the static printer catalog, server-side label rendering, job claim and lazy sweep, and the kit-facing printer status endpoint.

- [ ] **Step 6: Run the full gate**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/v1/print-locations CHANGELOG.md
git commit -m "feat(api): add the kit-facing printer status endpoint"
```

---

## Self-Review

**Spec coverage for Phase 1:** schema (Task 1), catalog (Task 2), layout builder (Task 3), rasterizer (Task 4), driver interfaces (Task 5), health (Task 6), `claim_job`/`sweepLocation`/`dispatchJob` (Task 7), status API (Task 8). The virtual printer moved to Phase 2 in the spec, because it needs the `cloud_poll` endpoint. Printer creation UI, setup wizards and credential minting belong to Phase 5 and to each connector's own phase; Phase 1 deliberately ships no way for a vendor to add a printer yet, which is why no task creates one.

**Known follow-ups this plan leaves to later phases:** `dispatchJob`'s `vendor_cloud` branch has no driver to call (Phase 3), `label-render.ts` stays until the Android bridge switches to the server PNG (Phase 4), and QR elements are skipped by the rasterizer until a job type produces one.

## Parent

[plans](README.md)
