create table paykit.feedback (
  id bigint generated always as identity primary key,
  vendor_id uuid not null references auth.users(id) on delete cascade,
  nps smallint not null check (nps between 0 and 10),
  message text,
  created_at timestamptz not null default now()
);

alter table paykit.feedback enable row level security;

create policy feedback_self_insert on paykit.feedback
  for insert
  to authenticated
  with check (vendor_id = auth.uid());

-- RLS + policy alone is not enough — Postgres also checks the table-level
-- privilege grant before it ever evaluates a policy, so without this an
-- authenticated vendor's insert fails with "permission denied for table
-- feedback" even though the policy above would allow it. Matches the grant
-- pattern used for paykit.refunds (0001_paykit_core.sql, ~line 141): insert
-- for authenticated, full access for service_role.
grant insert on paykit.feedback to authenticated;
grant all on paykit.feedback to service_role;
