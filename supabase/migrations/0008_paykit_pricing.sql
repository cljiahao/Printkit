-- 0008 — admin-editable pricing: a single-row config so the plan page,
-- dashboard nudge, and landing copy can show a live Pro price and an admin
-- can tune it without a deploy. Mirrors qkit's own qkit.pricing table
-- (qkit's supabase/migrations/0010_monetization.sql), narrowed to paykit's
-- one price — no day-pass concept here, that stays qkit-only per the
-- cross-kit pricing doc's own decision. id is pinned to 1.

create table paykit.pricing (
  id            int primary key default 1 check (id = 1),
  monthly_cents int not null default 0,
  currency      text not null default 'SGD',
  updated_at    timestamptz not null default now()
);

insert into paykit.pricing (id, monthly_cents)
  values (1, 499)
  on conflict (id) do nothing;

alter table paykit.pricing enable row level security;

-- Price isn't secret — shown on the anonymous landing page, not just
-- behind auth. Writes go through the service-role admin action only (no
-- write policy, matching qkit's pricing_public_select precedent).
create policy pricing_public_select on paykit.pricing
  for select using (true);

-- Data-API grants (be explicit).
grant select on paykit.pricing to anon, authenticated;
grant all on paykit.pricing to service_role;
