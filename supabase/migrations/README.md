# migrations

## Purpose

SQL schema for the `printkit` schema in the shared Merqo Supabase project —
tables, RLS policies, and grants, applied in order.

## Contents

- `0001_printkit_core.sql` — `print_jobs` (job/transaction history, `job_type` column designed to hold future job types beyond `'label'`), `kit_api_keys`, base RLS + grants.
- `0002_printkit_admin.sql` — `admins` (allow-list) + `is_admin(uid)` + `admin_audit`, immutable from creation (no update/delete grant ever issued to service_role).
- `0003_printkit_print_jobs_idempotency.sql` — unique `(source_kit, source_ref)` constraint on `print_jobs`, so a retried job-creation call can't create a duplicate physical label.

## Parent

See the repo root [README.md](../../README.md) for the full layout.
