-- Prevents a retried POST /api/v1/print-jobs (or a duplicate order-placed
-- webhook) from creating a second job row — and therefore a second
-- physical label — for the same source order. Mirrors paykit's own
-- 0007_paykit_checkout_idempotency.sql (unique on kit_slug, order_ref).
alter table printkit.print_jobs
  add constraint print_jobs_source_unique unique (source_kit, source_ref);

-- print_jobs_source_idx (0001_printkit_core.sql) is now fully redundant:
-- same columns, same order, same access method as the unique index above.
-- Keeping both wastes write cost on the table's hottest path.
drop index printkit.print_jobs_source_idx;
