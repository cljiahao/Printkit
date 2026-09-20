# plans

## Purpose

Step-by-step implementation plans, one per feature, each derived from the matching design spec in `../specs/`. These are historical build records (task breakdowns, file maps, self-review notes) — kept as project history, not living docs.

## Contents

- `2026-08-21-printkit-v0.1-plan1-scaffold-data-model.md` — "printkit v0.1 — Plan 1: Scaffold & Data Model": stands up printkit as a brand-new, standalone Next.js + Supabase repo — the Merqo family's hardware print connector — with its own `printkit` schema (`print_jobs`, `kit_api_keys`, `admins`/`is_admin`/`admin_audit`), RLS verified via pgTAP, and the bearer-secret kit-auth helper. Plan 2 (cross-kit integration wiring) is separate, not-yet-started work.
- `2026-09-20-printer-connectors-plan1-core.md` — "Printer connectors — Phase 1 (core)": the connector-agnostic core from the 2026-09-20 printer-connectors design — `printers`/`device_credentials`/`bridge_pairing_codes` schema plus the `claim_job` SQL function, the static printer catalog, the device-independent label layout builder and its server-side PNG rasterizer, the three driver interfaces and their registry, printer health (`last_seen_at`), job claim/lazy sweep/dispatch, and the kit-facing printer status endpoint. Phases 2-6 (Star CloudPRNT, Feie, bridge transports, vendor UI, qkit wiring) are separate plans.

## Parent

[docs](../../README.md)
