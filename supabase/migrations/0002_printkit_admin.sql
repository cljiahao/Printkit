-- Platform-operator admin: an internal allow-list of admins and an
-- immutable audit trail of disputable vendor/admin actions. Mirrors
-- paykit's 0006_paykit_admin.sql + 0009_paykit_admin_audit_immutable.sql,
-- folded into one migration since printkit has no pre-existing admin_audit
-- rows to migrate around.

create table printkit.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function printkit.is_admin(p_uid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from printkit.admins where user_id = p_uid);
$$;

create table printkit.admin_audit (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references auth.users(id),
  action     text not null,
  target_id  uuid,
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_created_idx on printkit.admin_audit (created_at desc);

alter table printkit.admins      enable row level security;
alter table printkit.admin_audit enable row level security;

create policy admins_admin_select on printkit.admins
  for select using (printkit.is_admin((select auth.uid())));
create policy admin_audit_admin_select on printkit.admin_audit
  for select using (printkit.is_admin((select auth.uid())));

grant select on printkit.admins, printkit.admin_audit to authenticated;
grant select, insert on printkit.admin_audit to service_role;
grant all on printkit.admins to service_role;
grant execute on function printkit.is_admin(uuid) to anon, authenticated, service_role;

-- admin_audit is service-role insert/select only, no update/delete grant
-- even for service_role (see grant above — update/delete simply never
-- granted, closing off tampering at the grant level independent of RLS).

-- Bootstrap the first admin by SQL (no self-elevation UI). Find your id
-- under Authentication -> Users, then run:
--   insert into printkit.admins (user_id) values ('<YOUR_AUTH_USER_ID>');
