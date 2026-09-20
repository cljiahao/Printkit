# Printer connectors — Phase 5 (vendor UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a vendor choose the right printer for their stall and get it printing, without knowing what a connector is.

**Architecture:** The static catalog is the single source of what a vendor sees: the picker filters and sorts it, and every badge on a card has an "i" button whose words come from one shared copy module, so the picker, the wizards and the guide never say the same fact three different ways. Each connector gets its own setup wizard, ending in a live wait that turns into "Connected" when the printer first reports in. Bluetooth is offered, labelled as the most work, and pushed through a public guide page that opens by not recommending it.

**Tech Stack:** Next.js 16 App Router (server pages, client islands), Tailwind v4 with the repo's existing tokens, Radix primitives via `radix-ui`, `lucide-react`, Vitest with jsdom.

**Spec:** `docs/superpowers/specs/2026-09-20-printer-connectors-design.md`

**Depends on:** Phases 1-4 (catalog, printers, health, credentials, pairing codes, and the three connectors).

## Global Constraints

Phase 1's Global Constraints, plus, from the Impeccable Operate-mode pass:

- The surface is Operate mode: scanability and earned familiarity beat expression. The one Read surface is the guide page.
- Vendors use iPads. Explanations open on tap, never hover only, and every tap target is a real button.
- No em dash in any user-facing copy (enforced by lint in `.tsx`).
- Copy is plain language: no "connector", "driver", "endpoint" or "poll" in anything a vendor reads.
- One accent for action, status colour for state only. No decorative motion.

## Tasks

### Task 1: Info popovers and shared copy

- [ ] **Step 1:** Add `src/components/ui/popover.tsx` following the repo's existing primitive style.
- [ ] **Step 2:** Add `src/lib/printer-info-copy.ts`: one entry per topic (iPad alone, helper device, 4G, WiFi, Bluetooth, untested, setup effort, price, label width, recommended), plus the standing Bluetooth warning sentence.
- [ ] **Step 3:** Add `src/components/info-button.tsx`: an icon button that opens its topic's explanation, labelled for screen readers.
- [ ] **Step 4:** Commit.

### Task 2: The printer picker

- [ ] **Step 1: Write the failing test** covering: only printers needing no helper device show by default; turning that filter off reveals the Bluetooth printer; it carries a "not recommended" note and a link to the guide; filtering by connection and by label width; the empty state; sorting by price; recommended first by default; the dev-only printer stays hidden; the booth is carried into the setup link; every badge has an explanation button.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement** `printer-picker.tsx` and `new/page.tsx`.
- [ ] **Step 4: Run the test again, expect PASS.**
- [ ] **Step 5: Commit.**

### Task 3: The printers page

- [ ] **Step 1:** One row per booth: printer name, live state, connector in plain words, and the right next action (choose a printer, setup steps, or open bridge mode).
- [ ] **Step 2:** Point the dashboard nav at it in place of "Bridge".
- [ ] **Step 3:** Commit.

### Task 4: Setup wizards

- [ ] **Step 1:** `setup/actions.ts`: mint a printer URL, register a brand-cloud printer from its SN and KEY, make a Pi pairing code, and read the live printer state. Each one re-derives that the booth belongs to the caller.
- [ ] **Step 2:** `setup/setup-wizard.tsx`: numbered steps per connector, each ending in a live "waiting for your printer" that becomes "Connected".
- [ ] **Step 3:** `setup/page.tsx` routes by the chosen model's connector.
- [ ] **Step 4:** Commit.

### Task 5: The Bluetooth guide

- [ ] **Step 1:** Public page at `/guides/bluetooth-printers`, outside the dashboard so support and qkit can link to it.
- [ ] **Step 2:** Structure: the warning first, why a second device is needed, the Android steps, the Raspberry Pi steps with real commands, then troubleshooting.
- [ ] **Step 3:** Run `pnpm check && pnpm test` and the design detector, then commit.

## Self-Review

**Spec coverage for Phase 5:** printers page, picker with filters and sorting, "i" popovers with the spec's own copy, the three setup wizards, and the guide page with its "we do not recommend this" banner.

**Known gap:** no screenshots were taken. printkit's dev server needs Supabase keys that are not present in this working copy, and writing an env file is blocked by the harness, so this UI is verified by typecheck, lint, the design detector and jsdom tests rather than by eye. A visual pass on a real deployment is still owed.

**Not here:** printer removal and credential rotation from the UI (the data layer supports both), and the qkit-side copy (Phase 6).

## Parent

[plans](README.md)
