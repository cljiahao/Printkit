# specs

## Purpose

Design docs, one per feature, written and approved before the matching implementation plan in `../plans/`. Each states the problem, the locked decisions, and the scope boundary — kept as project history, not living docs.

## Contents

- `2026-08-21-printkit-v0.1-design.md` — "printkit v0.1 — Design": the hardware print connector for Merqo vendors — job-type-agnostic architecture, v0.1 ships one job type (label, via the NIIMBOT B1). Owns the `printkit` schema in the shared Supabase project; qkit calls printkit's bearer-secret `POST /api/v1/print-jobs` on order-placed, printkit calls back into qkit on job status change. Scoped internal-only (no external integrators, no marketing landing page, no pricing) — `/` is a redirect, not a pitch page.

## Parent

[docs](../../README.md)
