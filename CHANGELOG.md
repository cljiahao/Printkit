# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Per-location print routing: a new `print_locations` table lets a vendor pair a separate physical bridge/printer to each of their booths instead of one shared bridge per vendor, closing the multi-simultaneous-location gap in the v0.1 design. New `POST /api/v1/print-locations` registration endpoint; `POST /api/v1/print-jobs` gains an optional `location_ref` field. Presence and job-delivery Realtime channels are now location-scoped. Bridge pairing gains a location picker; the Overview page shows per-location bridge status plus an "unrouted jobs" callout; History gets a location column and a manual location-assign action for unrouted jobs.

### Changed

- Root page (`/`) now redirects to `/dashboard` instead of showing a placeholder — printkit has no cold-acquisition funnel, so it needs no marketing landing page.
- Bumped `@merqo/ui` to v0.19.0: the account menu's theme control now sits behind a collapsed "Theme · {current}" submenu instead of three always-expanded radio options.

## [0.1.0] - 2026-08-21

### Added

- Initial printkit scaffold: seeded from paykit, pruned to a bare Next.js + Supabase harness.
- Auth scaffolding (login, session guard).
- Data model: `print_jobs`, `kit_api_keys`, `admins`/`is_admin`/`admin_audit` with RLS, verified against real Postgres via pgTAP.
- Bearer-secret kit-auth verification helper (`kit-auth.ts`), `create-kit-key.mjs` for minting calling-kit secrets.
