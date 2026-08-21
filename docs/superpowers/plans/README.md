# plans

## Purpose

Step-by-step implementation plans, one per feature, each derived from the matching design spec in `../specs/`. These are historical build records (task breakdowns, file maps, self-review notes) — kept as project history, not living docs.

## Contents

- `2026-08-21-printkit-v0.1-plan1-scaffold-data-model.md` — "printkit v0.1 — Plan 1: Scaffold & Data Model": stands up printkit as a brand-new, standalone Next.js + Supabase repo — the Merqo family's hardware print connector — with its own `printkit` schema (`print_jobs`, `kit_api_keys`, `admins`/`is_admin`/`admin_audit`), RLS verified via pgTAP, and the bearer-secret kit-auth helper. Plan 2 (cross-kit integration wiring) is separate, not-yet-started work.

## Parent

[docs](../../README.md)
