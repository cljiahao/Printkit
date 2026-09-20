# Printer connectors — Phase 4 (bridge: Android and Raspberry Pi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the existing Bluetooth bridge onto the shared connector model, and add a second transport (a Raspberry Pi agent) for vendors who own a Bluetooth printer but cannot leave a phone beside it.

**Architecture:** The bridge stops being a special case. It renders nothing itself: it downloads the same server-rendered PNG every other connector uses, claims each job through `claim_job` (a realtime event is only a hint), and reports health through the same `last_seen_at` heartbeat rather than a realtime presence channel. The Pi agent is a printkit client, not a CloudPRNT client: it pairs with a one-time code, then polls printkit with a device token.

**Tech Stack:** Next.js 16 route handlers and server actions, `@mmote/niimbluelib` (Android, Web Bluetooth), `@mmote/niimblue-node` with `noble` (Pi), systemd, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-20-printer-connectors-design.md`

**Depends on:** Phase 1 (claim, sweep, health, catalog, rasterizer) and Phase 2's device credentials.

## Global Constraints

Phase 1's Global Constraints, plus:

- The bridge never draws a label. It prints the PNG printkit rendered.
- A realtime event is a hint to claim, never permission to print. Every print is preceded by a successful claim.
- The Pi agent authenticates with a bearer device token, hashed in `device_credentials`; pairing codes are single use and expire in 10 minutes.
- Bluetooth stays the least recommended option, and every screen that offers it says so.

## Part A: Android transport

### Task A1: Server-rendered label download

**Files:** create `src/app/api/bridge/jobs/[id]/label/route.ts`, its test and README.

**Produces:** `GET /api/bridge/jobs/[id]/label`, vendor-session authenticated, returning `image/png`.

- [ ] **Step 1: Write the failing test** covering: a signed-out caller gets 401; a job belonging to another vendor gets 404 (the session client's RLS decides, not a filter in the handler); a job whose location has no printer gets 404; a valid request returns PNG bytes rendered at that printer's label size.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the test again, expect PASS.**
- [ ] **Step 5: Commit** (`feat(api): serve the rendered label to bridge devices`).

### Task A2: Claim, heartbeat and printer row

**Files:** modify `src/app/dashboard/bridge/actions.ts` and its test.

**Produces:** `claimBridgeJob(jobId)`, `bridgeHeartbeat(locationId)`, `ensureBridgePrinter(locationId)`.

- [ ] **Step 1: Write the failing test** covering: claiming a job the vendor does not own fails without touching `claim_job`; a job already claimed returns "nothing to print"; the heartbeat sweeps the location and updates the printer's `last_seen_at`; `ensureBridgePrinter` creates a `niimbot-b1` printer once and reuses it afterwards.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the test again, expect PASS.**
- [ ] **Step 5: Commit** (`feat: claim and heartbeat from the Android bridge`).

### Task A3: Panel rewiring, presence removal

**Files:** modify `src/app/dashboard/bridge/bridge-panel.tsx` and its test; delete `use-bridge-presence.ts` and `src/components/bridge-status.tsx`; modify `src/app/dashboard/page.tsx`.

- [ ] **Step 1: Write the failing test** covering: a delivered job is claimed before anything is printed and is skipped when the claim fails; the printed image comes from the label route; turning Bridge mode on claims a job already waiting; the heartbeat fires while Bridge mode is on and stops when it is off.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement.** The dashboard's printer status now reads `printers.last_seen_at` server-side instead of subscribing to a presence channel.
- [ ] **Step 4: Run the test again, expect PASS.**
- [ ] **Step 5: Commit** (`refactor: print server-rendered labels on the Android bridge`).

## Part B: Raspberry Pi transport

### Task B1: Pairing and agent endpoints

**Files:** create `src/lib/bridge-pairing.ts` and its test; create `src/app/api/v1/bridge-agent/{pair,next-job,jobs/[id]/label,jobs/[id]/result}` routes with tests and a README.

**Produces:** `createPairingCode(printerId)`, `redeemPairingCode(code)`; the four agent endpoints, all authenticated by the agent's bearer token.

- [ ] **Step 1: Write the failing tests** covering: a code is single use and expires after 10 minutes; redeeming mints an agent token; an unknown or expired code is rejected; `next-job` sweeps, heartbeats and claims one job, answering 204 when there is none; the label route serves only a job claimed by that agent's own printer; `result` records printed or failed; every endpoint refuses a missing or wrong token.
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again, expect PASS.**
- [ ] **Step 5: Commit** (`feat(api): add the Raspberry Pi bridge agent endpoints`).

### Task B2: The agent program

**Files:** create `bridge-agent/` (its own `package.json`, `src/`, `install.sh`, `printkit-bridge.service`, README) and its tests.

**Produces:** `printkit-bridge pair <code>`, `scan`, `use <name>`, `run`.

- [ ] **Step 1: Write the failing test** covering, against a fake BLE transport and a fake printkit: the run loop claims, prints and reports; a print failure is reported as failed rather than retried silently; a disconnect reconnects with backoff; a revoked token stops the loop.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement.** Config and token live in a file with mode `600`.
- [ ] **Step 4: Run the test again, expect PASS.**
- [ ] **Step 5: Commit** (`feat: add the Raspberry Pi bridge agent`).

## Self-Review

**Spec coverage for Phase 4:** the Android changes the spec lists (server PNG, heartbeat instead of presence, claim before print, printer row on pairing) in Part A, and the Pi transport (pairing code, token, poll loop, systemd, distribution) in Part B.

**Deliberately not here:** the Bluetooth guide page and the setup wizard that shows a pairing code (Phase 5), and the hardware gate for `niimbot-b1`, which needs a real B1 and a real Pi.

## Parent

[plans](README.md)
