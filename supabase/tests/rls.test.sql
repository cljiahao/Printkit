begin;
select plan(6);

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
  null,
  null,
  'vendor cannot insert into print_jobs (service-role only)'
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

select * from finish();
rollback;
