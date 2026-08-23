-- print_locations: one row per (calling kit, opaque location id) — e.g. qkit's
-- booths.id. printkit never interprets source_ref/label; a location is just
-- something a bridge device can be paired to. Mirrors print_jobs' own
-- (source_kit, source_ref) uniqueness (0003_printkit_print_jobs_idempotency.sql) —
-- source_ref values are already globally unique per calling kit, no vendor_id
-- needed in the key.

create table printkit.print_locations (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references auth.users(id) on delete cascade,
  source_kit text not null,
  source_ref text not null,
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (source_kit, source_ref)
);
create index print_locations_vendor_idx on printkit.print_locations (vendor_id, created_at asc);

alter table printkit.print_locations enable row level security;

create policy print_locations_vendor_select on printkit.print_locations
  for select using ((select auth.uid()) = vendor_id);

grant select on printkit.print_locations to authenticated;
grant all on printkit.print_locations to service_role;

alter table printkit.print_jobs
  add column location_id uuid references printkit.print_locations(id);
create index print_jobs_location_idx on printkit.print_jobs (location_id);
