# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-08-21

### Added

- Initial printkit scaffold: seeded from paykit, pruned to a bare Next.js + Supabase harness.
- Auth scaffolding (login, session guard).
- Data model: `print_jobs`, `kit_api_keys`, `admins`/`is_admin`/`admin_audit` with RLS, verified against real Postgres via pgTAP.
- Bearer-secret kit-auth verification helper (`kit-auth.ts`), `create-kit-key.mjs` for minting calling-kit secrets.
