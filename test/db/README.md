# test/db

## Purpose

Cheap regex-presence guards against silent drift in the hand-written SQL
migrations — a fast sanity check, not a substitute for `supabase/tests/rls.test.sql`
(pgTAP against real Postgres, run in CI's `db` job).

## Contents

- `schema.test.ts` — asserts `0001_printkit_core.sql` creates the `printkit` schema and its core tables/RLS.
- `admin-schema.test.ts` — asserts `0002_printkit_admin.sql` creates `admins`/`is_admin`/`admin_audit` with RLS and the expected grants.
- `kit-api-keys-callback-schema.test.ts` — asserts `0006_kit_api_keys_callback.sql` adds `callback_url`/`callback_secret` and never grants `kit_api_keys` to `authenticated`/`anon`.

## Parent

See the repo root [README.md](../../README.md) for the full layout.
