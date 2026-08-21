# tests

## Purpose

The pgTAP suite that proves printkit's Postgres-enforced authorization
actually holds. Because authorization lives in RLS policies and grants
rather than in application code, this suite — not the Vitest suite — is
the authoritative check on it: a mocked unit test can only assert what the
app _asks_ the database for, never what the database _permits_.

## Contents

- `rls.test.sql` — one rolled-back transaction with inline fixed-UUID
  fixtures (Vendor A, Vendor B). Asserts:
  - `print_jobs` and `admin_audit` tables exist.
  - **Cross-vendor isolation** — Vendor A reads only their own
    `print_jobs` row; Vendor B's select of the same table returns 0 rows.
  - **Writes are service-role only** — an authenticated vendor's insert
    into `print_jobs` throws (no insert policy is ever granted to
    `authenticated`; writes come from the bearer-secret `/api/v1/print-jobs`
    route or the dashboard's service-role reprint action).
  - **`admin_audit` is admin-read-only** — a non-admin authenticated user
    sees 0 rows.

  Keep `select plan(N)` in step with the number of assertions; pgTAP fails
  the run on a count mismatch.

## Connectivity

Run with `supabase test db` (Supabase CLI, Docker required), which applies
`../migrations/` to a fresh local database first — so a malformed migration
fails here too. The fixtures are inline and self-contained — no seed file,
no API keys, no running Next.js app needed.

## Parent

See the repo root [README.md](../../README.md) for the full layout.
