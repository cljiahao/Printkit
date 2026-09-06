begin;
select plan(15);

select has_table('printkit', 'print_jobs', 'print_jobs table exists');
select has_table('printkit', 'admin_audit', 'admin_audit table exists');

-- print_jobs: vendor can select only their own row
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'vendor-a@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'vendor-b@test.dev');

insert into printkit.print_jobs (vendor_id, payload, source_kit, source_ref)
values (
  '11111111-1111-1111-1111-111111111111',
  '{"customer_name": "Alice"}'::jsonb,
  'qkit',
  'order-1'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

select results_eq(
  $$ select count(*) from printkit.print_jobs $$,
  $$ values (1::bigint) $$,
  'vendor A sees their own print_jobs row'
);

set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';

select results_eq(
  $$ select count(*) from printkit.print_jobs $$,
  $$ values (0::bigint) $$,
  'vendor B does not see vendor A''s print_jobs row'
);

select throws_ok(
  $$ insert into printkit.print_jobs (vendor_id, payload, source_kit, source_ref)
     values ('22222222-2222-2222-2222-222222222222', '{}'::jsonb, 'qkit', 'order-2') $$,
  '42501',
  null,
  'vendor cannot insert into print_jobs (insufficient_privilege)'
);

reset role;

-- Real duplicate-insert enforcement — proves Postgres actually raises 23505
-- for a genuine (source_kit, source_ref) collision, not just that
-- print-jobs.ts's unit tests mock that error code correctly.
select throws_ok(
  $$ insert into printkit.print_jobs (vendor_id, payload, source_kit, source_ref)
     values ('11111111-1111-1111-1111-111111111111', '{}'::jsonb, 'qkit', 'order-1') $$,
  '23505',
  null,
  'duplicate (source_kit, source_ref) is rejected by the real unique constraint'
);

-- print_locations: vendor reads only their own rows
insert into printkit.print_locations (vendor_id, source_kit, source_ref, label)
values (
  '11111111-1111-1111-1111-111111111111',
  'qkit',
  'booth-1',
  'Main Booth'
),
(
  '22222222-2222-2222-2222-222222222222',
  'qkit',
  'booth-2',
  'Side Booth'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

select results_eq(
  $$ select count(*) from printkit.print_locations $$,
  $$ values (1::bigint) $$,
  'vendor A sees only their own print_locations row'
);

set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';

select results_eq(
  $$ select count(*) from printkit.print_locations $$,
  $$ values (1::bigint) $$,
  'vendor B does not see vendor A''s print_locations row'
);

reset role;

-- admin_audit: non-admin authenticated user sees nothing
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

select results_eq(
  $$ select count(*) from printkit.admin_audit $$,
  $$ values (0::bigint) $$,
  'non-admin sees no admin_audit rows'
);

reset role;

-- Positive admin-read test: an admin genuinely sees admin_audit rows.
-- Without this, is_admin() silently returning false always would still
-- pass the suite (the existing test only proves a NON-admin sees nothing).
insert into printkit.admins (user_id)
values ('11111111-1111-1111-1111-111111111111');

insert into printkit.admin_audit (admin_id, action, detail)
values ('11111111-1111-1111-1111-111111111111', 'test_action', '{}'::jsonb);

set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

select results_eq(
  $$ select count(*) from printkit.admin_audit $$,
  $$ values (1::bigint) $$,
  'admin sees their own admin_audit insert'
);

reset role;

-- kit_api_keys denial: the single most security-critical table in the
-- schema (holds bearer-secret hashes) has zero policies AND zero grants —
-- prove Postgres actually refuses an authenticated select, not just that
-- the migration text lacks a grant line.
insert into printkit.kit_api_keys (kit_slug, secret_hash)
values ('qkit', 'irrelevant-hash-value');

set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

select throws_ok(
  $$ select * from printkit.kit_api_keys $$,
  '42501',
  null,
  'authenticated role cannot select kit_api_keys (insufficient_privilege)'
);

reset role;

-- legal_check_state: service-role-only (RLS on, zero policies), same shape
-- as kit_api_keys — proves the migration actually enabled RLS and granted no
-- policy, not just that the migration text lacks one.
select ok(
  (select relrowsecurity from pg_class where oid = 'printkit.legal_check_state'::regclass),
  'RLS on legal_check_state'
);
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'printkit' and tablename = 'legal_check_state'),
  0,
  'legal_check_state has no RLS policies (service-role-only)'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';

select throws_ok(
  $$ select * from printkit.legal_check_state $$,
  '42501',
  null,
  'authenticated role cannot select legal_check_state (insufficient_privilege)'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from printkit.legal_check_state $$,
  '42501',
  null,
  'anon role cannot select legal_check_state (insufficient_privilege)'
);

reset role;

select * from finish();
rollback;
