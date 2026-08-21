-- Idempotency: a calling kit retrying POST /api/v1/checkout after a
-- timeout/network blip (same kit_slug + order_ref) must not create a second
-- pending transaction requiring manual vendor reconciliation. The checkout
-- route catches this constraint's unique-violation (Postgres error 23505)
-- and returns the existing transaction instead of erroring.
alter table paykit.transactions
  add constraint transactions_kit_slug_order_ref_key unique (kit_slug, order_ref);
