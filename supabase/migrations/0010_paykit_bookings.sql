-- Booking (deposit + balance) support for event-cart vendors. A booking
-- links to up to two `transactions` rows (deposit, then later balance) by
-- id; paykit itself never mutates a transaction's own status here — this
-- only reflects it.

create table paykit.bookings (
  id                     uuid primary key default gen_random_uuid(),
  vendor_id              uuid not null references auth.users(id) on delete cascade,
  customer_name          text not null,
  customer_phone         text,
  event_date             date not null,
  total_amount_cents     integer not null check (total_amount_cents > 0),
  deposit_amount_cents   integer not null check (deposit_amount_cents > 0),
  balance_amount_cents   integer not null check (balance_amount_cents > 0),
  balance_due_date       date not null,
  status                 text not null default 'pending_deposit'
    check (status in ('pending_deposit', 'deposit_paid', 'fully_paid', 'cancelled')),
  deposit_transaction_id uuid references paykit.transactions(id),
  balance_transaction_id uuid references paykit.transactions(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint bookings_amounts_add_up check (
    deposit_amount_cents + balance_amount_cents = total_amount_cents
  )
);
create index bookings_vendor_created_idx on paykit.bookings (vendor_id, created_at desc);
create index bookings_vendor_status_idx on paykit.bookings (vendor_id, status);
create index bookings_deposit_tx_idx on paykit.bookings (deposit_transaction_id);
create index bookings_balance_tx_idx on paykit.bookings (balance_transaction_id);

create trigger bookings_set_updated_at
before update on paykit.bookings
for each row execute function paykit.set_updated_at();

-- Keeps `bookings.status` correct regardless of which path confirmed the
-- linked transaction (the bearer-secret /api/v1/checkout/{id}/confirm API,
-- called by any kit — a booking's own deposit/balance transactions carry
-- kit_slug = 'paykit', but nothing here assumes that). Only reacts to a
-- transaction actually turning 'confirmed'; a cancelled booking is never
-- reopened by a late confirmation.
create or replace function paykit.sync_booking_status()
returns trigger language plpgsql as $$
declare
  b paykit.bookings%rowtype;
  deposit_confirmed boolean;
  balance_confirmed boolean;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;

  for b in
    select * from paykit.bookings
    where (deposit_transaction_id = new.id or balance_transaction_id = new.id)
      and status <> 'cancelled'
  loop
    deposit_confirmed := exists (
      select 1 from paykit.transactions t
      where t.id = b.deposit_transaction_id and t.status = 'confirmed'
    );
    balance_confirmed := b.balance_transaction_id is not null and exists (
      select 1 from paykit.transactions t
      where t.id = b.balance_transaction_id and t.status = 'confirmed'
    );

    if deposit_confirmed and balance_confirmed then
      update paykit.bookings set status = 'fully_paid'
      where id = b.id and status <> 'cancelled';
    elsif deposit_confirmed then
      update paykit.bookings set status = 'deposit_paid'
      where id = b.id and status = 'pending_deposit';
    end if;
  end loop;

  return new;
end;
$$;

create trigger transactions_sync_booking_status
after update of status on paykit.transactions
for each row execute function paykit.sync_booking_status();

alter table paykit.bookings enable row level security;

create policy bookings_own on paykit.bookings
  for all
  using (vendor_id = (select auth.uid()))
  with check (vendor_id = (select auth.uid()));

-- `deposit_transaction_id`/`balance_transaction_id` are excluded from the
-- vendor's own column-scoped grants below, same instinct as `plan` on
-- `vendor_payment_config` (0001_paykit_core.sql): the `bookings_own` RLS
-- policy only checks `vendor_id`, so an unrestricted grant would let a
-- vendor point their own booking's FK at another vendor's transaction —
-- which `sync_booking_status()` above would then act on. Only the
-- checkout-creation server actions (service-role client) ever set these.
grant select on paykit.bookings to authenticated;
grant insert (
  vendor_id, customer_name, customer_phone, event_date,
  total_amount_cents, deposit_amount_cents, balance_amount_cents, balance_due_date
) on paykit.bookings to authenticated;
grant update (
  customer_name, customer_phone, event_date,
  total_amount_cents, deposit_amount_cents, balance_amount_cents, balance_due_date, status
) on paykit.bookings to authenticated;

grant all on paykit.bookings to service_role;
