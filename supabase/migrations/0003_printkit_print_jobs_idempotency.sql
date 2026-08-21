-- Prevents a retried POST /api/v1/print-jobs (or a duplicate order-placed
-- webhook) from creating a second job row — and therefore a second
-- physical label — for the same source order. Mirrors paykit's own
-- 0007_paykit_checkout_idempotency.sql (unique on kit_slug, order_ref).
alter table printkit.print_jobs
  add constraint print_jobs_source_unique unique (source_kit, source_ref);
