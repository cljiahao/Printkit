# migrations

## Purpose

SQL schema for the `paykit` schema in the shared Merqo Supabase project —
tables, RLS policies, RPCs, and grants, applied in order.

## Contents

- `0001_paykit_core.sql` — `vendor_payment_config`, `transactions`, `refunds`, `kit_api_keys`, `tx_count_this_month()`, base RLS + grants.
- `0002_feedback.sql` — vendor feedback (NPS) submission plumbing.
- `0003_paykit_multi_method.sql` — adds the `pointer` payment-method kind (a vendor's own link/QR image) alongside `paynow`, with the kind-shape CHECK constraint.
- `0004_vendor_feedback_backfill.sql` — backfills existing feedback rows into the cross-kit `merqo.vendor_feedback` convergence table.
- `0005_paykit_vendor_prefs.sql` — `vendor_prefs` (currently just `tour_seen_at`, dashboard onboarding-tour state).
- `0006_paykit_admin.sql` — `admins` (allow-list) + `is_admin(uid)` + `admin_audit`, backing the Merqo-team `/admin` console's gate and audit trail.
- `0007_paykit_checkout_idempotency.sql` — unique constraint on `transactions (kit_slug, order_ref)`, so a retried `POST /api/v1/checkout` call can't create a duplicate pending transaction.
- `0008_paykit_pricing.sql` — `pricing`, a single-row (`id` pinned to 1) admin-editable price config (`monthly_cents`, `currency`), seeded at 499 ($4.99). Public-read RLS (the price isn't secret); no write policy — writes go through the service-role `setPricing` admin action only.
- `0009_paykit_admin_audit_immutable.sql` — revokes `UPDATE`/`DELETE` on `admin_audit` from `service_role` (kept to `SELECT`/`INSERT`) — the app only ever inserts, so this closes off tampering at the grant level, independent of RLS (which never binds `service_role`).
- `0010_paykit_bookings.sql` — `bookings` (deposit-now/balance-later event-cart bookings), linking up to two `transactions` rows by id (`deposit_transaction_id`/`balance_transaction_id`). `sync_booking_status()` is an `after update of status on transactions` trigger that flips a linked booking to `deposit_paid`/`fully_paid` once its transaction(s) confirm, regardless of which path (dashboard or bearer-secret API) did the confirming. RLS mirrors `vendor_payment_config_own`; the two transaction-id columns are excluded from the vendor's own `INSERT`/`UPDATE` grant (same instinct as `plan` in 0001) since the policy only checks `vendor_id`, not that the linked transaction is actually this vendor's own.

## Parent

See the repo root [README.md](../../README.md) for the full layout.
