-- Adds print_jobs to the supabase_realtime publication so Plan 4's
-- postgres_changes subscription (bridge job delivery) actually receives
-- INSERT/UPDATE events. A table not in this publication emits nothing
-- regardless of client-side subscription code. RLS (0001_printkit_core.sql's
-- print_jobs_vendor_select policy) is what actually restricts which rows a
-- given authenticated session's subscription can ever receive — this
-- migration only turns the feed on, it grants no new access.
alter publication supabase_realtime add table printkit.print_jobs;
