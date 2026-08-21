# tests

## Purpose

The pgTAP suite that proves paykit's Postgres-enforced authorization
actually holds. Because authorization lives in RLS policies and grants
rather than in application code (see `AGENTS.md`), this suite — not the
Vitest suite — is the authoritative check on it: a mocked unit test can only
assert what the app _asks_ the database for, never what the database
_permits_.

## Contents

- `rls.test.sql` — one rolled-back transaction with inline fixed-UUID
  fixtures (Vendor A: free plan, UEN PayNow config; Vendor B: pro plan,
  mobile PayNow config). Asserts, per role:
  - **RLS is enabled** on every protected table (`vendor_payment_config`,
    `transactions`, `refunds`, `kit_api_keys`, `feedback`, `vendor_prefs`,
    `bookings`).
  - **`admin_audit` is append-only** (migration `0009`) — `service_role`
    can still `SELECT`/`INSERT` (the app's only write path, via
    `recordAudit()`) but a direct `UPDATE`/`DELETE` raises `42501`, checked
    independently of RLS (which never binds `service_role`).
  - **Cross-vendor isolation** — A reads/writes only its own
    `vendor_payment_config`/`transactions`; B's rows (including refunds)
    are invisible.
  - **Pro-gated refunds** — B (pro) can insert a refund against its own
    `confirmed` transaction; A (free) cannot, and neither vendor can read
    or write the other's.
  - **`anon` is locked out** of everything except the cross-kit checkout
    API's own service-role path — no direct table access.
  - **Booking ownership** — A reads/inserts/cancels only its own
    `bookings` row (an update targeting B's booking id affects 0 rows);
    inserting one for B's `vendor_id` throws. `deposit_transaction_id`/
    `balance_transaction_id` are excluded from the vendor's own `UPDATE`
    grant (`0010_paykit_bookings.sql`) — A repointing its own booking's
    `deposit_transaction_id` at B's transaction gets a `permission denied`
    error, not a silent no-op, since that FK is what
    `sync_booking_status()` trusts.

  Keep `select plan(N)` in step with the number of assertions; pgTAP fails
  the run on a count mismatch.

## Connectivity

Run with `supabase test db` (Supabase CLI, Docker required), which applies
`../migrations/` to a fresh local database first — so a malformed migration
fails here too. CI runs it as the `db` job in `.github/workflows/ci.yml`.
The fixtures are inline and self-contained — no seed file, no API keys, no
running Next.js app needed.

## Parent

See the repo root [README.md](../../README.md) for the full layout.
