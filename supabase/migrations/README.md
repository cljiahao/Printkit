# migrations

## Purpose

SQL schema for the `printkit` schema in the shared Merqo Supabase project —
tables, RLS policies, and grants, applied in order.

## Contents

- `0001_printkit_core.sql` — `print_jobs` (job/transaction history, `job_type` column designed to hold future job types beyond `'label'`), `kit_api_keys`, base RLS + grants.
- `0002_printkit_admin.sql` — `admins` (allow-list) + `is_admin(uid)` + `admin_audit`, immutable from creation (no update/delete grant ever issued to service_role).
- `0003_printkit_print_jobs_idempotency.sql` — unique `(source_kit, source_ref)` constraint on `print_jobs`, so a retried job-creation call can't create a duplicate physical label; also drops `print_jobs_source_idx` (0001), now redundant with the new unique index on the same columns.
- `0004_printkit_realtime.sql` — adds `print_jobs` to the `supabase_realtime` publication so the bridge device's `postgres_changes` subscription (Plan 4) receives job-delivery events. RLS still governs which rows a session receives.
- `0005_print_locations.sql` — `print_locations` (location/booth registry per calling kit), `location_id` FK on `print_jobs`, per-vendor RLS, plus `print_locations_vendor_idx` (vendor_id, created_at) and `print_jobs_location_idx` (location_id) for the same RLS-filtered-by-vendor / FK-lookup access patterns as `0001`'s indexes.
- `0006_kit_api_keys_callback.sql` — adds nullable `callback_url`/`callback_secret` to `kit_api_keys`, so a calling kit's print-status callback is configured per-row (`src/lib/kit-callback.ts`) instead of hardcoded to one kit's env vars. Plaintext, not hashed — printkit must present them itself.

## Parent

See the repo root [README.md](../../README.md) for the full layout.
