-- RLS cross-vendor isolation — pgTAP, run with `supabase test db`.
begin;
select plan(50);

-- ── Fixtures ──────────────────────────────────────────────────────────────
-- Vendor A: free plan, UEN config. Vendor B: pro plan, mobile config.
-- Vendor C: no config row yet (used to test the INSERT-time plan escalation).
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-a@test.local'),
  ('00000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-b@test.local'),
  ('00000000-0000-0000-0000-00000000000c',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-c@test.local');

insert into paykit.vendor_payment_config (vendor_id, uen, payee_name, plan)
values ('00000000-0000-0000-0000-00000000000a', '53312345A', 'Vendor A', 'free');
insert into paykit.vendor_payment_config (vendor_id, mobile, payee_name, plan)
values ('00000000-0000-0000-0000-00000000000b', '+6591234567', 'Vendor B', 'pro');

insert into paykit.transactions (id, vendor_id, kit_slug, order_ref, amount_cents, status, qr_payload)
values
  ('00000000-0000-0000-0000-0000000d0a01', '00000000-0000-0000-0000-00000000000a',
   'qkit', 'A-001', 500, 'pending', 'payload-a1'),
  ('00000000-0000-0000-0000-0000000d0a02', '00000000-0000-0000-0000-00000000000a',
   'qkit', 'A-002', 700, 'confirmed', 'payload-a2'),
  ('00000000-0000-0000-0000-0000000d0b01', '00000000-0000-0000-0000-00000000000b',
   'loopkit', 'B-001', 900, 'claimed', 'payload-b1'),
  ('00000000-0000-0000-0000-0000000d0b02', '00000000-0000-0000-0000-00000000000b',
   'loopkit', 'B-002', 1100, 'confirmed', 'payload-b2');

insert into paykit.kit_api_keys (kit_slug, secret_hash)
values ('qkit', 'deadbeef');

-- Vendor A has a booking whose deposit transaction is A's own (fixture
-- inserts run before `set local role authenticated`, so the full row —
-- including deposit_transaction_id, excluded from authenticated's own
-- UPDATE grant below — can be seeded directly here).
insert into paykit.bookings (
  id, vendor_id, customer_name, event_date,
  total_amount_cents, deposit_amount_cents, balance_amount_cents, balance_due_date,
  deposit_transaction_id
) values (
  '00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-00000000000a',
  'Alice Customer', '2026-12-01', 100000, 30000, 70000, '2026-11-24',
  '00000000-0000-0000-0000-0000000d0a01'
);
insert into paykit.bookings (
  id, vendor_id, customer_name, event_date,
  total_amount_cents, deposit_amount_cents, balance_amount_cents, balance_due_date
) values (
  '00000000-0000-0000-0000-0000000e0b01', '00000000-0000-0000-0000-00000000000b',
  'Bob Customer', '2026-12-05', 200000, 50000, 150000, '2026-11-28'
);

-- ── RLS is actually enabled on every protected table ─────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'paykit.vendor_payment_config'::regclass), 'RLS on vendor_payment_config');
select ok((select relrowsecurity from pg_class where oid = 'paykit.transactions'::regclass), 'RLS on transactions');
select ok((select relrowsecurity from pg_class where oid = 'paykit.refunds'::regclass), 'RLS on refunds');
select ok((select relrowsecurity from pg_class where oid = 'paykit.kit_api_keys'::regclass), 'RLS on kit_api_keys');
select ok((select relrowsecurity from pg_class where oid = 'paykit.feedback'::regclass), 'RLS on feedback');
select ok((select relrowsecurity from pg_class where oid = 'paykit.vendor_prefs'::regclass), 'RLS on vendor_prefs');
select ok((select relrowsecurity from pg_class where oid = 'paykit.bookings'::regclass), 'RLS on bookings');

-- 0009_paykit_admin_audit_immutable.sql: service_role can still append audit
-- rows (the app's only write path — recordAudit() in
-- src/app/admin/actions.ts) but can no longer UPDATE/DELETE one after the
-- fact, closing the tampering gap RLS alone doesn't (RLS only governs
-- authenticated/anon; service_role bypasses it entirely).
select ok(has_table_privilege('service_role', 'paykit.admin_audit', 'INSERT'),
  'service_role can still INSERT admin_audit');
select ok(not has_table_privilege('service_role', 'paykit.admin_audit', 'UPDATE'),
  'service_role cannot UPDATE admin_audit (revoked in 0009)');

-- ── Act as Vendor A ────────────────────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text,
  true);

select isnt_empty(
  $$ select 1 from paykit.vendor_payment_config where vendor_id = '00000000-0000-0000-0000-00000000000a' $$,
  'A reads its own config');
select is_empty(
  $$ select 1 from paykit.vendor_payment_config where vendor_id = '00000000-0000-0000-0000-00000000000b' $$,
  'A cannot read B config');
select isnt_empty(
  $$ select 1 from paykit.transactions where id = '00000000-0000-0000-0000-0000000d0a01' $$,
  'A reads its own transaction');
select is_empty(
  $$ select 1 from paykit.transactions where id = '00000000-0000-0000-0000-0000000d0b01' $$,
  'A cannot read B transaction');

select throws_ok(
  $$ insert into paykit.transactions (vendor_id, kit_slug, order_ref, amount_cents, qr_payload)
     values ('00000000-0000-0000-0000-00000000000a', 'qkit', 'FORGED', 100, 'x') $$,
  null,
  'A cannot INSERT into transactions directly (checkout API is service-role only)');
select throws_ok(
  $$ update paykit.transactions set status = 'confirmed'
     where id = '00000000-0000-0000-0000-0000000d0a01' $$,
  null,
  'A cannot UPDATE transactions directly (claim/confirm API is service-role only)');

select lives_ok(
  $$ update paykit.vendor_payment_config set payee_name = 'Vendor A Renamed'
     where vendor_id = '00000000-0000-0000-0000-00000000000a' $$,
  'A can update its own config');
with upd as (
  update paykit.vendor_payment_config set payee_name = 'Hacked'
  where vendor_id = '00000000-0000-0000-0000-00000000000b' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B config');

-- Task 4's original bug: an unrestricted grant let a vendor UPDATE its own
-- `plan` column straight to 'pro' — free self-escalation. The fix is a
-- column-scoped GRANT (migration 0001, ~line 137) that excludes `plan` from
-- authenticated's UPDATE privilege on this table. Postgres denies the
-- *entire* UPDATE statement if any targeted column lacks privilege (there is
-- no per-column silent skip), so the correct behavior is a permission error,
-- not a silent no-op. Real message on PG 17 is
-- `permission denied for table vendor_payment_config`; pattern kept loose
-- ('%permission denied%') so it still matches if Postgres ever names the
-- column instead of the table.
select throws_like(
  $$ update paykit.vendor_payment_config set plan = 'pro'
     where vendor_id = '00000000-0000-0000-0000-00000000000a' $$,
  '%permission denied%',
  'A cannot self-escalate to pro via UPDATE plan (column-scoped GRANT excludes plan)');

select throws_ok(
  $$ insert into paykit.refunds (transaction_id, refunded_amount_cents, created_by)
     values ('00000000-0000-0000-0000-0000000d0a02', 100, '00000000-0000-0000-0000-00000000000a') $$,
  null,
  'A cannot refund its own confirmed transaction while on the free plan');
select throws_ok(
  $$ insert into paykit.refunds (transaction_id, refunded_amount_cents, created_by)
     values ('00000000-0000-0000-0000-0000000d0b02', 100, '00000000-0000-0000-0000-00000000000a') $$,
  null,
  'A cannot refund B''s transaction');
select throws_ok(
  $$ select 1 from paykit.kit_api_keys $$,
  null,
  'A (authenticated) cannot SELECT kit_api_keys at all — service-role only');

select lives_ok(
  $$ insert into paykit.feedback (vendor_id, nps, message)
     values ('00000000-0000-0000-0000-00000000000a', 9, 'Great kit') $$,
  'A can insert its own feedback row');
select throws_ok(
  $$ insert into paykit.feedback (vendor_id, nps, message)
     values ('00000000-0000-0000-0000-00000000000b', 9, 'Forged') $$,
  null,
  'A cannot insert a feedback row for B (vendor_id must equal auth.uid())');

select lives_ok(
  $$ insert into paykit.vendor_prefs (vendor_id, tour_seen_at) values
     ('00000000-0000-0000-0000-00000000000a', now())
     on conflict (vendor_id) do update set tour_seen_at = excluded.tour_seen_at $$,
  'A can upsert its own vendor_prefs row (tour mark-seen)');
select isnt_empty(
  $$ select 1 from paykit.vendor_prefs where vendor_id = '00000000-0000-0000-0000-00000000000a' $$,
  'A reads its own vendor_prefs row');

-- ── Bookings: A can only see/touch its own ───────────────────────────────
select isnt_empty(
  $$ select 1 from paykit.bookings where id = '00000000-0000-0000-0000-0000000e0a01' $$,
  'A reads its own booking');
select is_empty(
  $$ select 1 from paykit.bookings where id = '00000000-0000-0000-0000-0000000e0b01' $$,
  'A cannot read B''s booking');

select lives_ok(
  $$ insert into paykit.bookings (
       vendor_id, customer_name, event_date,
       total_amount_cents, deposit_amount_cents, balance_amount_cents, balance_due_date
     ) values (
       '00000000-0000-0000-0000-00000000000a', 'New Customer', '2027-01-10',
       50000, 20000, 30000, '2027-01-03'
     ) $$,
  'A can insert its own booking');
select throws_ok(
  $$ insert into paykit.bookings (
       vendor_id, customer_name, event_date,
       total_amount_cents, deposit_amount_cents, balance_amount_cents, balance_due_date
     ) values (
       '00000000-0000-0000-0000-00000000000b', 'Forged', '2027-01-10',
       50000, 20000, 30000, '2027-01-03'
     ) $$,
  null,
  'A cannot insert a booking for B (vendor_id must equal auth.uid())');

select lives_ok(
  $$ update paykit.bookings set status = 'cancelled'
     where id = '00000000-0000-0000-0000-0000000e0a01' $$,
  'A can cancel its own booking');
with upd as (
  update paykit.bookings set status = 'cancelled'
  where id = '00000000-0000-0000-0000-0000000e0b01' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B''s booking (cancel or otherwise)');

-- deposit_transaction_id/balance_transaction_id are excluded from the
-- vendor's own UPDATE grant (0010_paykit_bookings.sql) so a vendor can't
-- repoint their own booking's FK at another vendor's transaction — which
-- the sync_booking_status() trigger would then act on.
select throws_like(
  $$ update paykit.bookings set deposit_transaction_id = '00000000-0000-0000-0000-0000000d0b02'
     where id = '00000000-0000-0000-0000-0000000e0a01' $$,
  '%permission denied%',
  'A cannot repoint its own booking''s deposit_transaction_id at B''s transaction (column excluded from the UPDATE grant)');

-- ── Act as Vendor C (no config row yet) ──────────────────────────────────────
-- Same self-escalation bug, INSERT path: the column-scoped INSERT grant
-- (migration 0001, ~line 135) also excludes `plan`, so a first-time vendor
-- cannot create their own row already set to 'pro'.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000c', 'role', 'authenticated')::text,
  true);

select throws_like(
  $$ insert into paykit.vendor_payment_config (vendor_id, uen, payee_name, plan)
     values ('00000000-0000-0000-0000-00000000000c', '53398765Z', 'Vendor C', 'pro') $$,
  '%permission denied%',
  'C cannot self-escalate to pro via INSERT plan (column-scoped GRANT excludes plan)');

-- ── Act as Vendor B (pro) ────────────────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text,
  true);

select lives_ok(
  $$ insert into paykit.refunds (transaction_id, refunded_amount_cents, reason, created_by)
     values ('00000000-0000-0000-0000-0000000d0b02', 200, 'customer request', '00000000-0000-0000-0000-00000000000b') $$,
  'B (pro) can refund its own confirmed transaction');
select throws_ok(
  $$ insert into paykit.refunds (transaction_id, refunded_amount_cents, created_by)
     values ('00000000-0000-0000-0000-0000000d0b01', 100, '00000000-0000-0000-0000-00000000000b') $$,
  null,
  'B cannot refund its own transaction while it is only claimed, not confirmed');
select isnt_empty(
  $$ select 1 from paykit.refunds where transaction_id = '00000000-0000-0000-0000-0000000d0b02' $$,
  'B reads its own refund');

select is(
  paykit.tx_count_this_month('00000000-0000-0000-0000-00000000000b'),
  2, 'B can query its own tx_count_this_month (2 transactions)');
select throws_like(
  $$ select paykit.tx_count_this_month('00000000-0000-0000-0000-00000000000a') $$,
  '%not authorized%',
  'B cannot query A''s tx_count_this_month');

select lives_ok(
  $$ insert into paykit.vendor_prefs (vendor_id, tour_seen_at) values
     ('00000000-0000-0000-0000-00000000000b', now())
     on conflict (vendor_id) do update set tour_seen_at = excluded.tour_seen_at $$,
  'B can upsert its own vendor_prefs row');

-- ── Back to A: cannot read B's refund ─────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text,
  true);
select is_empty(
  $$ select 1 from paykit.refunds where transaction_id = '00000000-0000-0000-0000-0000000d0b02' $$,
  'A cannot read B''s refund');
select is_empty(
  $$ select 1 from paykit.vendor_prefs where vendor_id = '00000000-0000-0000-0000-00000000000b' $$,
  'A cannot read B''s vendor_prefs row');
with upd as (
  update paykit.vendor_prefs set tour_seen_at = now()
  where vendor_id = '00000000-0000-0000-0000-00000000000b' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B''s vendor_prefs row');

-- ── Act as an anonymous caller (anon role) ──────────────────────────────────
reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select throws_ok(
  $$ select 1 from paykit.vendor_payment_config limit 1 $$,
  null,
  'anon cannot SELECT vendor_payment_config');
select throws_ok(
  $$ select 1 from paykit.transactions limit 1 $$,
  null,
  'anon cannot SELECT transactions');
select throws_ok(
  $$ select 1 from paykit.refunds limit 1 $$,
  null,
  'anon cannot SELECT refunds');
select throws_ok(
  $$ select 1 from paykit.kit_api_keys limit 1 $$,
  null,
  'anon cannot SELECT kit_api_keys');
select throws_ok(
  $$ select 1 from paykit.vendor_prefs limit 1 $$,
  null,
  'anon cannot SELECT vendor_prefs');
select throws_ok(
  $$ select 1 from paykit.bookings limit 1 $$,
  null,
  'anon cannot SELECT bookings');
select throws_ok(
  $$ insert into paykit.feedback (vendor_id, nps)
     values ('00000000-0000-0000-0000-00000000000a', 9) $$,
  null,
  'anon cannot INSERT feedback at all');

-- The existing B-cannot-query-A's-tx_count_this_month test above only
-- exercises the function's internal `auth.uid() <> p_vendor` guard, which is
-- a no-op when auth.uid() is null — true for BOTH service_role and anon. The
-- actual protection against an anonymous caller is the explicit
-- `revoke execute on function paykit.tx_count_this_month(uuid) from public`
-- in migration 0001 (~line 149); without it anon would inherit PUBLIC's
-- default EXECUTE grant and could query any vendor's monthly count. Real
-- message on PG 17 is `permission denied for function tx_count_this_month`.
select throws_like(
  $$ select paykit.tx_count_this_month('00000000-0000-0000-0000-00000000000a') $$,
  '%permission denied for function%',
  'anon cannot call tx_count_this_month — EXECUTE revoked from PUBLIC');

reset role;
select * from finish();
rollback;
