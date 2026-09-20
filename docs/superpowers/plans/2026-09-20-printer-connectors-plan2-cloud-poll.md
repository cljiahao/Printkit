# Printer connectors — Phase 2 (cloud_poll + Star CloudPRNT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a printer that fetches its own jobs over HTTPS print a qkit order label end to end, with no helper device, and make that path testable without buying hardware.

**Architecture:** One route, `/api/cloudprnt/[token]`, serves every `cloud_poll` printer. The URL's token is the printer's only credential: it resolves to a printer row, and nothing else in the request is trusted. The route owns the generic steps (authenticate, sweep, peek, claim, render, confirm); the `star-cloudprnt` driver owns Star's wire format. A dev-only virtual printer page speaks the same protocol against the same route, so the whole path is exercised before any hardware exists.

**Tech Stack:** Next.js 16 route handlers, TypeScript strict, Supabase service-role, Zod, Vitest, `@napi-rs/canvas` (via Phase 1's rasterizer).

**Spec:** `docs/superpowers/specs/2026-09-20-printer-connectors-design.md`

**Depends on:** Phase 1 (`docs/superpowers/plans/2026-09-20-printer-connectors-plan1-core.md`) — `printers`, `device_credentials`, `claim_job`, `claimJob`/`sweepLocation`, `buildLabelLayout`/`rasterizeLayout`, the driver registry.

## Global Constraints

Same as Phase 1's Global Constraints (TypeScript strict, Zod at boundaries, RLS as the authorization boundary, service-role server-side only, no secrets in `NEXT_PUBLIC_*`, own-line comments, no em dash in user-facing `.tsx` copy, Conventional Commits, README per changed folder, CHANGELOG for `src/` changes). Plus, for this phase:

- A device-facing route resolves the printer from its credential alone. It never trusts a printer id, vendor id or location id sent by the device.
- Tokens are 32 random bytes, base64url. Only the SHA-256 hash is stored; the raw token is shown once.
- Every job handed to a device goes through `claimJob`, so a job can never be printed twice.
- The poll step never claims. Only the job fetch claims.
- The virtual printer is blocked when `VERCEL_ENV === "production"`.

## File Structure

| File                                              | Responsibility                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `src/lib/device-credentials.ts`                   | Mint, hash, rotate and revoke a device credential                  |
| `src/lib/connectors/cloud-poll/star-cloudprnt.ts` | Star CloudPRNT v1 wire format                                      |
| `src/lib/connectors/cloud-poll/drivers.ts`        | Driver registration for this connector                             |
| `src/lib/connectors/cloud-poll/service.ts`        | Connector logic shared by every `cloud_poll` driver                |
| `src/app/api/cloudprnt/[token]/route.ts`          | `POST` poll, `GET` job, `DELETE` confirm                           |
| `src/lib/printers.ts`                             | Extended with `createPrinter`, `bindDeviceRef`, `peekClaimableJob` |
| `src/app/dashboard/dev/virtual-printer/*`         | Dev-only printer simulator                                         |

---

### Task 1: Device credentials

**Files:**

- Create: `src/lib/device-credentials.ts`, `src/lib/device-credentials.test.ts`
- Modify: `src/lib/README.md`

**Interfaces:**

- Consumes: `createServiceClient`, `hashApiKey` (`@/lib/kit-auth`).
- Produces: `type DeviceCredentialKind = "cloudprnt_url_token" | "bridge_agent_token"`; `mintDeviceCredential(printerId: string, kind: DeviceCredentialKind): Promise<string | null>` (returns the raw token once); `hashDeviceToken(token: string): string`; `revokeDeviceCredential(printerId: string): Promise<void>`.

- [ ] **Step 1: Write the failing test** covering: a minted token is 43 characters of base64url and is never stored raw (the row holds its SHA-256); minting twice for one printer replaces the row and stamps `rotated_at`; a DB error returns null rather than throwing; `revokeDeviceCredential` deletes the row.

- [ ] **Step 2: Run it and watch it fail** — `pnpm exec vitest run src/lib/device-credentials.test.ts`.

- [ ] **Step 3: Implement** using `randomBytes(32).toString("base64url")` and an upsert on `printer_id`.

- [ ] **Step 4: Run the test again, expect PASS.**

- [ ] **Step 5: Update `src/lib/README.md` and commit** (`feat: mint and revoke device credentials`).

---

### Task 2: Printer writes and job peek

**Files:**

- Modify: `src/lib/printers.ts`, `src/lib/printers.test.ts`, `src/lib/README.md`

**Interfaces:**

- Produces: `createPrinter(input: { vendorId, locationId, catalogId, displayName? }): Promise<PrinterRow | null>`; `bindDeviceRef(printerId: string, deviceRef: string): Promise<void>`; `peekClaimableJob(locationId: string): Promise<{ id: string } | null>`.

- [ ] **Step 1: Write the failing test** covering: `createPrinter` copies connector, driver and default label size from the catalog entry and rejects an unknown `catalogId`; `bindDeviceRef` writes only when the printer has no `device_ref` yet; `peekClaimableJob` returns the oldest job still inside the expiry window and null when there is none.

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement.** `peekClaimableJob` mirrors `claim_job`'s filter (`status = 'queued'`, `coalesce(requeued_at, created_at)` inside `JOB_EXPIRY_MS`, oldest first) but does not write, because the poll step must not claim.

- [ ] **Step 4: Run the test again, expect PASS.**

- [ ] **Step 5: Commit** (`feat: add printer creation, device binding and job peek`).

---

### Task 3: Star CloudPRNT driver

**Files:**

- Create: `src/lib/connectors/cloud-poll/star-cloudprnt.ts`, `src/lib/connectors/cloud-poll/star-cloudprnt.test.ts`, `src/lib/connectors/cloud-poll/drivers.ts`, `src/lib/connectors/cloud-poll/README.md`

**Interfaces:**

- Consumes: `CloudPollDriver`, `registerDriver`.
- Produces: `starCloudPrntDriver: CloudPollDriver`, registered under `"star-cloudprnt"`.

Protocol facts this driver encodes (from the Star CloudPRNT v1 HTTP reference):

- Poll is a `POST` with a JSON body carrying `printerMAC` and `statusCode`.
- The poll reply is JSON: `{"jobReady": boolean, "mediaTypes": ["image/png"], "jobToken": "<job id>"}`. `jobToken` is only meaningful when `jobReady` is true.
- The job fetch is a `GET` carrying the `token` query parameter, which echoes `jobToken`.
- Confirmation is a `DELETE` carrying `token` and a `code`.

- [ ] **Step 1: Write the failing test** covering: `parsePoll` reads `printerMAC` and tolerates a malformed body (device ref null, never throws); `pollResponse(null)` is `{"jobReady":false}` with no `jobToken`; `pollResponse({id})` advertises `image/png` and returns the id as `jobToken`; `parseConfirmation` maps a success code to `printed` and anything else to `failed`, and reads the job id from `token`.

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement.** Success codes: treat a missing `code`, `"OK"`, or a code beginning with `2` as printed; everything else is a failure. Star's exact confirmation codes are unverified until the hardware gate, so the driver logs any code it does not recognise, and the hardware gate checks this mapping first.

- [ ] **Step 4: Run the test again, expect PASS.**

- [ ] **Step 5: Write the folder README and commit** (`feat: add the Star CloudPRNT driver`).

---

### Task 4: The cloud_poll route

**Files:**

- Create: `src/app/api/cloudprnt/[token]/route.ts`, `src/app/api/cloudprnt/[token]/route.test.ts`, `src/app/api/cloudprnt/README.md`
- Create: `src/lib/connectors/cloud-poll/service.ts`, `src/lib/connectors/cloud-poll/service.test.ts`

**Interfaces:**

- Consumes: `getPrinterByTokenHash`, `hashDeviceToken`, `sweepLocation`, `peekClaimableJob`, `claimJob`, `touchPrinterSeen`, `bindDeviceRef`, `buildLabelLayout`, `rasterizeLayout`, `getCatalogEntry`, `updatePrintJobStatus`, the driver registry.
- Produces: `POST`, `GET` and `DELETE` handlers for `/api/cloudprnt/[token]`, and in `service.ts`: `resolveDevice(token: string)`, `renderJobPng(job, printer)`.

- [ ] **Step 1: Write the failing route test** covering:
  - an unknown token returns 401 on all three methods;
  - a poll with no waiting job answers `jobReady: false` and updates health;
  - a poll with a waiting job answers `jobReady: true` plus that job's id, and leaves the job `queued` (the poll must not claim);
  - the first poll binds the reported MAC to `device_ref`; a later poll from a different MAC is 401 and writes an `admin_audit` row;
  - `GET` claims the job and returns `image/png` with a PNG body;
  - a second `GET` for the same job returns 404 (already claimed), which is the double-print guard;
  - `DELETE` with a success code marks the job `printed`; with an error code, `failed` with `device_reported_error`;
  - a `GET` for a job belonging to another printer's location returns 404.

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement.** Order inside every handler: resolve the printer from the token hash, then `sweepLocation`, then `touchPrinterSeen`, then the method's own work. The driver is looked up by `printer.driver`; an unregistered driver is a 500 with a logged error, never a crash.

- [ ] **Step 4: Run the test again, expect PASS.**

- [ ] **Step 5: Write the READMEs and commit** (`feat(api): add the cloud_poll printer endpoint`).

---

### Task 5: Virtual printer (dev and preview only)

**Files:**

- Create: `src/app/dashboard/dev/virtual-printer/page.tsx`, `virtual-printer-panel.tsx`, `actions.ts`, `README.md`, plus a dom test for the panel.

**Interfaces:**

- Consumes: `createPrinter`, `mintDeviceCredential`, `listActiveLocations`, the `/api/cloudprnt/[token]` route.
- Produces: a page that creates a `virtual` printer for a chosen location, then polls its own endpoint every 3 seconds, renders each received PNG on screen, and confirms it.

- [ ] **Step 1: Write the failing dom test** covering: the panel shows "Waiting for a job" when idle, renders an image once a job arrives, and calls confirm after rendering.

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement.** The page returns `notFound()` when `process.env.VERCEL_ENV === "production"`. The panel holds the token in memory only. Copy avoids em dashes.

- [ ] **Step 4: Run the test again, expect PASS.**

- [ ] **Step 5: Run `pnpm check && pnpm test`, update `CHANGELOG.md` and the dashboard README, and commit** (`feat: add the dev-only virtual printer`).

---

## Self-Review

**Spec coverage for Phase 2:** the `cloud_poll` endpoint and its device binding (Task 4), the Star driver (Task 3), the credential model it authenticates with (Task 1), the supporting printer writes and non-claiming peek (Task 2), and the virtual printer the spec moved into this phase (Task 5).

**Deliberately not here:** the vendor-facing setup wizard that shows the URL (Phase 5), Epson Server Direct Print (a later driver), CloudPRNT v2 over MQTT (out of scope), and the hardware gate for `star-mc-label2`, which stays `hardwareVerified: false` until a real unit is tested.

## Parent

[plans](README.md)
