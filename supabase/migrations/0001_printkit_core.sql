create schema if not exists printkit;

create table printkit.print_jobs (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references auth.users(id) on delete cascade,
  job_type     text not null default 'label' check (job_type in ('label')),
  payload      jsonb not null,
  status       text not null default 'queued' check (status in ('queued', 'sent', 'printed', 'failed')),
  source_kit   text not null,
  source_ref   text not null,
  created_at   timestamptz not null default now(),
  printed_at   timestamptz
);
create index print_jobs_vendor_idx on printkit.print_jobs (vendor_id, created_at desc);
create index print_jobs_source_idx on printkit.print_jobs (source_kit, source_ref);

create table printkit.kit_api_keys (
  kit_slug    text primary key,
  secret_hash text not null,
  created_at  timestamptz not null default now()
);

-- RLS: a vendor reads (not writes) only their own print_jobs. Writes are
-- service-role + bearer-secret only (POST /api/v1/print-jobs from qkit,
-- and the dashboard's manual-reprint action) — same shape as paykit's
-- transactions table.
alter table printkit.print_jobs   enable row level security;
alter table printkit.kit_api_keys enable row level security;

create policy print_jobs_vendor_select on printkit.print_jobs
  for select using ((select auth.uid()) = vendor_id);

-- kit_api_keys: no policy at all — only service_role (which bypasses RLS)
-- may ever touch it. No grants below give authenticated/anon any access.

grant usage on schema printkit to anon, authenticated, service_role;
grant select on printkit.print_jobs to authenticated;
grant all on printkit.print_jobs, printkit.kit_api_keys to service_role;
