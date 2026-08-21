-- Remember whether a vendor has seen the dashboard onboarding tour, so it
-- auto-runs only on first login (the floating "?" replay button ignores
-- this). Stored server-side (not localStorage) so it's user-scoped and
-- consistent across devices/browsers. A dedicated table, not a column on
-- vendor_payment_config — that table is payment-config-only per its own
-- AGENTS.md column contract, and bolting UI state onto it would conflate
-- concerns. No row exists for any vendor at migration time, so
-- tour_seen_at is nullable and a missing row reads as "unseen".
create table paykit.vendor_prefs (
  vendor_id    uuid primary key references auth.users(id) on delete cascade,
  tour_seen_at timestamptz
);

alter table paykit.vendor_prefs enable row level security;

-- Same shape as vendor_payment_config's own policy (0001_paykit_core.sql,
-- ~line 87): one FOR ALL policy scoped to the owning vendor, covering
-- select/insert/update/delete alike. FOR ALL (not just select/update) is
-- required here because markTourSeen upserts — a vendor's first mark-seen
-- has no existing row to update against.
create policy vendor_prefs_own on paykit.vendor_prefs
  for all
  using (vendor_id = (select auth.uid()))
  with check (vendor_id = (select auth.uid()));

grant usage on schema paykit to anon, authenticated, service_role;
grant select, insert, update, delete on paykit.vendor_prefs to authenticated;
grant all on paykit.vendor_prefs to service_role;
