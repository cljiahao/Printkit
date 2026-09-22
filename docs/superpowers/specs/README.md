# specs

## Purpose

Design docs, one per feature, written and approved before the matching implementation plan in `../plans/`. Each states the problem, the locked decisions, and the scope boundary — kept as project history, not living docs.

## Contents

- `2026-08-21-printkit-v0.1-design.md` — "printkit v0.1 — Design": the hardware print connector for Merqo vendors — job-type-agnostic architecture, v0.1 ships one job type (label, via the NIIMBOT B1). Owns the `printkit` schema in the shared Supabase project; qkit calls printkit's bearer-secret `POST /api/v1/print-jobs` on order-placed, printkit calls back into qkit on job status change. Scoped internal-only (no external integrators, no marketing landing page, no pricing) — `/` is a redirect, not a pitch page.
- `2026-09-20-printer-connectors-design.md` — "Printer connectors — Design": replaces the Android-bridge-only delivery model with exactly three connectors (`cloud_poll` for printers that poll printkit, e.g. Star CloudPRNT; `vendor_cloud` for printers reached through their maker's cloud API, e.g. Feie 4G; `bridge` for Bluetooth printers via an Android phone or a new Raspberry Pi agent), brand drivers inside each, a static printer catalog driving a filterable picker (recommendation order, decided 2026-09-22: standalone WiFi printers first, maker-cloud printers second, Bluetooth last) with "i" info tips, server-side label layout rendering, unified printer health, a qkit-facing printer status API, and a "not recommended" Bluetooth setup guide. Triggered by an iPad-only vendor declining a second device; Bluefy and native iOS apps rejected.

## Parent

[docs](../../README.md)
