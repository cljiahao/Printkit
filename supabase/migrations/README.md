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
- `0007_legal_check_state.sql` — `legal_check_state`, a TTL cache (`email` PK, `checked_at`, `is_current`) for "is this vendor's terms/privacy acceptance current with merqo?" — printkit owns no acceptance record itself, so `src/lib/legal-gate.ts` calls merqo's `GET /api/merqo/legal-status` and caches the result here for 5 minutes, mirroring merqo's own `vendor_sync_state` throttle. Service-role only (RLS on, zero policies), same shape as `kit_api_keys`.
- `0008_printers_core.sql` — the printer-connectors core (`docs/superpowers/specs/2026-09-20-printer-connectors-design.md`): `printers` (one configured physical printer per `print_locations` row, carrying its catalog id, connector and driver, label size, `device_ref` and the `last_seen_at` health signal), `device_credentials` and `bridge_pairing_codes` (device-presented secrets as SHA-256 hashes, service-role only, zero policies — same shape as `kit_api_keys`), four new `print_jobs` columns (`driver_ref`, `failure_reason`, `sent_at`, `requeued_at`), and `claim_job(p_location_id, p_job_id)` — a `security definer` function that is the only path from `queued` to `sent`, using `for update skip locked` so two devices can never claim the same job. Also adds `print_locations_id_vendor_key` so `printers` enforces "the location belongs to the same vendor" with a composite FK rather than app code.

## Parent

See the repo root [README.md](../../README.md) for the full layout.
