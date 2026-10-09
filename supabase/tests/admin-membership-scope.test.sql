begin;
select plan(6);
insert into auth.users(id,instance_id,aud,role,email) values
('10000000-0000-4000-8000-000000000021','00000000-0000-0000-0000-000000000000','authenticated','authenticated','print-admin-scope@test.local'),
('10000000-0000-4000-8000-000000000031','00000000-0000-0000-0000-000000000000','authenticated','authenticated','print-admin-foreign@test.local');
insert into printkit.admins(user_id) values('10000000-0000-4000-8000-000000000031');
select ok(not has_function_privilege('anon','printkit.is_admin(uuid)','EXECUTE'),'anonymous administrator probing revoked');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000021","role":"authenticated"}',true);
select is(printkit.is_admin('10000000-0000-4000-8000-000000000031'),false,'foreign administrator membership is private');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000031","role":"authenticated"}',true);
select is(printkit.is_admin('10000000-0000-4000-8000-000000000031'),true,'administrator can check own membership');
select is(printkit.is_admin(null),false,'null subject fails closed');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(printkit.is_admin('10000000-0000-4000-8000-000000000031'),true,'service administration retains membership lookup');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{}',true);
select is(printkit.is_admin('10000000-0000-4000-8000-000000000031'),false,'existing administrator remains private without identity claims');
reset role;
select * from finish();
rollback;
