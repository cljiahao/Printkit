-- printers: one configured physical printer per print location. connector and
-- driver are copied from the static catalog (src/lib/printer-catalog.ts) at
-- creation so job routing never needs a catalog lookup in SQL.
-- device_credentials and bridge_pairing_codes hold device-presented secrets as
-- hashes only, and are service-role-only (same shape as kit_api_keys).

alter table printkit.print_locations
  add constraint print_locations_id_vendor_key unique (id, vendor_id);

create table printkit.printers (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null unique references printkit.print_locations(id) on delete cascade,
  catalog_id text not null,
  connector text not null check (connector in ('cloud_poll', 'vendor_cloud', 'bridge')),
  driver text not null,
  display_name text not null,
  label_width_mm numeric not null,
  label_height_mm numeric not null,
  device_ref text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  constraint printers_location_vendor_fkey
    foreign key (location_id, vendor_id)
    references printkit.print_locations(id, vendor_id)
    on delete cascade
);
create index printers_vendor_idx on printkit.printers (vendor_id, created_at asc);

create table printkit.device_credentials (
  printer_id uuid primary key references printkit.printers(id) on delete cascade,
  kind text not null check (kind in ('cloudprnt_url_token', 'bridge_agent_token')),
  token_hash text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);
create unique index device_credentials_token_hash_idx
  on printkit.device_credentials (token_hash);

create table printkit.bridge_pairing_codes (
  code_hash text primary key,
  printer_id uuid not null references printkit.printers(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

alter table printkit.print_jobs add column driver_ref text;
alter table printkit.print_jobs add column failure_reason text;
alter table printkit.print_jobs add column sent_at timestamptz;
alter table printkit.print_jobs add column requeued_at timestamptz;

create index print_jobs_claimable_idx
  on printkit.print_jobs (location_id, status, created_at);

alter table printkit.printers enable row level security;
alter table printkit.device_credentials enable row level security;
alter table printkit.bridge_pairing_codes enable row level security;

create policy printers_vendor_select on printkit.printers
  for select using ((select auth.uid()) = vendor_id);

grant select on printkit.printers to authenticated;
grant all on printkit.printers to service_role;
grant all on printkit.device_credentials to service_role;
grant all on printkit.bridge_pairing_codes to service_role;

-- claim_job: the only path from 'queued' to 'sent'. "for update skip locked"
-- plus the single-row update means two concurrent callers can never claim the
-- same job. p_job_id null claims the oldest claimable job; a given p_job_id
-- claims that job or nothing. The 30-minute window is the spec's job expiry.

create function printkit.claim_job(
  p_location_id uuid,
  p_job_id uuid default null
)
returns setof printkit.print_jobs
language sql
security definer
set search_path = printkit, public
as $$
  update printkit.print_jobs
  set status = 'sent', sent_at = now()
  where id = (
    select id from printkit.print_jobs
    where location_id = p_location_id
      and status = 'queued'
      and (p_job_id is null or id = p_job_id)
      and coalesce(requeued_at, created_at) > now() - interval '30 minutes'
    order by coalesce(requeued_at, created_at)
    limit 1
    for update skip locked
  )
  returning *;
$$;

revoke all on function printkit.claim_job(uuid, uuid) from public, anon, authenticated;
grant execute on function printkit.claim_job(uuid, uuid) to service_role;
