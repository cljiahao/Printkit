# Printer connectors — Phase 3 (vendor_cloud + Feie) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print a qkit order label on a 4G printer that has no WiFi, no helper device and no app, by sending the job to the printer maker's cloud.

**Architecture:** printkit pushes. On job creation, `dispatchJob` claims the job (same `claim_job` guard as the pull connectors, so nothing is ever sent twice), asks the driver to send it, and records the maker's own job id as `driver_ref`. The result comes back either through the maker's signed callback or, if that is lost, through a status query during the lazy sweep. Feie cannot accept a full-label image (its `<IMG>` tag takes a square image of at most 224 px), so this driver translates the label layout into Feie's own tag markup instead of a PNG.

**Tech Stack:** Next.js 16 route handlers, TypeScript strict, Zod, Node `crypto` (SHA-1 request signing, RSA callback verification), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-20-printer-connectors-design.md`

**Depends on:** Phase 1 (claim, sweep, dispatch, layout, catalog, printers) and the driver interfaces.

## Global Constraints

Phase 1's Global Constraints, plus:

- `FEIE_USER`, `FEIE_UKEY`, `FEIE_API_BASE` and `FEIE_CALLBACK_PUBLIC_KEY` are server-only environment variables, read at request time, never `NEXT_PUBLIC_*`.
- Every Feie request is signed `sha1(user + ukey + stime)` and carries a 5 second timeout. A timeout is a `driver_error`, never a throw.
- The vendor's printer KEY is used once at registration and never stored. Only the SN is kept, as `printers.device_ref`.
- A callback with a missing or invalid signature changes nothing and answers 401.
- Label markup must stay under Feie's 5000 byte limit.

## Protocol facts (from Feie's Asia-Pacific API documentation)

- Base: `https://api.jp.feieyun.com/Api/Open/`, form-encoded POST, parameters `user`, `stime`, `sig`, `apiname`, plus each call's own.
- `Open_printerAddlist` takes `printerContent` as `SN#KEY#remark`, newline separated, at most 100 per call.
- `Open_printLabelMsg` takes `sn`, `content` (markup, 5000 bytes max) and `times`. Its response `data` is the maker's order id.
- `Open_queryOrderState` takes `orderid` and returns `data` as a boolean: printed or pending.
- `Open_queryPrinterStatus` takes `sn` and returns a human-readable state string; only "off-line" is reliably a negative.
- `Open_printerDelList` takes `snlist`.
- Label markup: `<SIZE>w,h</SIZE>` (mm), `<GAP>m,n</GAP>`, `<DIRECTION>n</DIRECTION>`, `<TEXT x="" y="" font="" w="" h="" r="">text</TEXT>`, `<QR x="" y="" e="" w="">content</QR>`. Coordinates are dots at 8 dots per millimetre.
- Every response is `{ret, msg, data, serverExecutedTime}`, with `ret: 0` meaning success.

---

### Task 1: Label markup translation

**Files:** create `src/lib/connectors/vendor-cloud/feie-markup.ts` and its test.

**Produces:** `toFeieMarkup(layout: LabelLayout): string`, `FEIE_DOTS_PER_MM = 8`, `FEIE_CONTENT_LIMIT = 5000`.

- [ ] **Step 1: Write the failing test** covering: the markup opens with `<SIZE>` in millimetres; text positions are converted to dots; the extra-large order number is magnified more than the name; a QR element becomes a `<QR>` tag; markup never exceeds the byte limit (text is dropped from the end rather than truncating a tag); XML-special characters in a customer name are escaped.

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement.** Map layout sizes to Feie magnification: `sm` 1, `md` 2, `lg` 3, `xl` 4. Centre and right alignment are approximated by shifting `x` by the estimated text width, since Feie has no alignment attribute.

- [ ] **Step 4: Run the test again, expect PASS.**

- [ ] **Step 5: Commit** (`feat: translate a label layout into Feie markup`).

---

### Task 2: The Feie driver

**Files:** create `src/lib/connectors/vendor-cloud/feie.ts`, its test, `drivers.ts` and the folder README; modify `.env.example`.

**Produces:** `feieDriver: VendorCloudDriver`; `getVendorCloudDriver(id)`.

- [ ] **Step 1: Write the failing test** covering: request signing (`sig` is `sha1(user + ukey + stime)`); `registerPrinter` posts `SN#KEY#name` and returns the SN as `deviceRef`; a non-zero `ret` becomes `{ok:false}` with the maker's message; `send` posts the markup and returns the maker's order id as `driverRef`; `queryJob` maps `data: true` to printed and `false` to pending; `queryPrinter` maps "off-line" to offline and a normal state to online; a network failure, a timeout and malformed JSON all collapse to a failure result without throwing; a missing `FEIE_USER` or `FEIE_UKEY` returns a failure without calling `fetch`.

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement** with `AbortSignal.timeout(5000)` and a single `call()` helper shared by every endpoint.

- [ ] **Step 4: Run the test again, expect PASS.**

- [ ] **Step 5: Write the README, document the env vars and commit** (`feat: add the Feie vendor-cloud driver`).

---

### Task 3: Push dispatch and status reconciliation

**Files:** modify `src/lib/job-dispatch.ts` and its test; create `src/lib/connectors/vendor-cloud/service.ts` and its test.

**Produces:** `sendVendorCloudJob(job, printer)`; `dispatchJob` completes its `vendor_cloud` branch; `sweepLocation` reconciles `sent` jobs against the maker.

- [ ] **Step 1: Write the failing test** covering: dispatch claims the job before sending, so a duplicate dispatch sends nothing; a successful send stores `driver_ref`; a failed send marks the job `failed` with `driver_error`; the sweep queries at most 10 `sent` jobs older than 60 seconds and marks them printed or failed from the answer; a `vendor_cloud` job is only failed by timeout after 5 minutes, not the 2 minutes used for devices that pull.

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement.** `sweepLocation` reads the location's printer once and branches on its connector.

- [ ] **Step 4: Run the test again, expect PASS.**

- [ ] **Step 5: Commit** (`feat: send and reconcile vendor-cloud print jobs`).

---

### Task 4: The Feie callback

**Files:** create `src/app/api/feie/callback/route.ts`, its test and README.

**Produces:** `POST /api/feie/callback`.

- [ ] **Step 1: Write the failing test** covering: a valid RSA signature over the documented field order marks the job printed (or failed) by its `driver_ref`; an invalid signature answers 401 and changes nothing; a missing public key answers 401; an unknown `orderId` answers 200 without changing anything, so the maker does not retry forever.

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement** with `crypto.verify("RSA-SHA256", ...)` and a lookup by `driver_ref`.

- [ ] **Step 4: Run the test again, expect PASS.**

- [ ] **Step 5: Run `pnpm check && pnpm test`, update `CHANGELOG.md`, and commit** (`feat(api): accept Feie print-result callbacks`).

---

## Self-Review

**Spec coverage for Phase 3:** markup translation (Task 1), the driver and its credentials (Task 2), push dispatch and the lost-callback fallback (Task 3), the signed callback (Task 4).

**Open items this phase inherits from the spec, unresolved until hardware or a seller answers:** where Feie publishes the callback public key, whether the Asia-Pacific station signs callbacks identically, whether Feie's built-in Chinese font needs a different `font` attribute value, and Feie's undocumented rate limits. Each is handled defensively (fail closed, log, never throw) rather than guessed at.

**Not here:** the vendor-facing setup form that collects SN and KEY (Phase 5), Xpyun and Sunmi drivers (added when a vendor picks one), and the hardware gate for `feie-fp-n20h`, which stays `hardwareVerified: false`.

## Parent

[plans](README.md)
