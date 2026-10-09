begin;
select plan(13);

select ok(not has_function_privilege('anon', 'printkit.claim_cloud_poll_job(uuid,uuid,timestamptz,timestamptz)', 'execute'), 'anonymous callers cannot claim CloudPRNT revisions');
select ok(not has_function_privilege('authenticated', 'printkit.claim_cloud_poll_job(uuid,uuid,timestamptz,timestamptz)', 'execute'), 'browser callers cannot claim CloudPRNT revisions');
select ok(has_function_privilege('service_role', 'printkit.claim_cloud_poll_job(uuid,uuid,timestamptz,timestamptz)', 'execute'), 'server service role may claim CloudPRNT revisions');

insert into auth.users(id,email) values ('9c999999-9999-4999-8999-999999999991','cloud-revision-fixture@test.invalid');
insert into printkit.print_locations(id,vendor_id,source_kit,source_ref,label)
values ('9c999999-9999-4999-8999-999999999992','9c999999-9999-4999-8999-999999999991','qkit','cloud-revision-fixture','Revision fixture');
insert into printkit.print_jobs(id,vendor_id,location_id,payload,source_kit,source_ref,created_at)
values ('9c999999-9999-4999-8999-999999999993','9c999999-9999-4999-8999-999999999991','9c999999-9999-4999-8999-999999999992','{}'::jsonb,'qkit','cloud-revision-fixture',now()-interval '5 minutes');

set local role service_role;
select is((select count(*) from printkit.claim_cloud_poll_job('9c999999-9999-4999-8999-999999999992','9c999999-9999-4999-8999-999999999993',now()-interval '5 minutes',null)),1::bigint,'matching queued revision claims once');
select is((select count(*) from printkit.claim_cloud_poll_job('9c999999-9999-4999-8999-999999999992','9c999999-9999-4999-8999-999999999993',now()-interval '5 minutes',null)),0::bigint,'duplicate GET cannot claim a sent revision again');

update printkit.print_jobs set status='queued',sent_at=null where id='9c999999-9999-4999-8999-999999999993';
select is((select count(*) from printkit.claim_cloud_poll_job('9c999999-9999-4999-8999-999999999992','9c999999-9999-4999-8999-999999999993',now()-interval '5 minutes'+interval '1 microsecond',null)),0::bigint,'creation revision mismatch preserves microseconds');
select is((select count(*) from printkit.claim_cloud_poll_job('9c999999-9999-4999-8999-999999999994','9c999999-9999-4999-8999-999999999993',now()-interval '5 minutes',null)),0::bigint,'another printer location cannot claim the job');

update printkit.print_jobs set requeued_at=now()+interval '1 microsecond' where id='9c999999-9999-4999-8999-999999999993';
select is((select count(*) from printkit.claim_cloud_poll_job('9c999999-9999-4999-8999-999999999992','9c999999-9999-4999-8999-999999999993',now()-interval '5 minutes',null)),0::bigint,'old queue token cannot claim the same requeued job');
select is((select count(*) from printkit.claim_cloud_poll_job('9c999999-9999-4999-8999-999999999992','9c999999-9999-4999-8999-999999999993',now()-interval '5 minutes',now()+interval '1 microsecond')),1::bigint,'current queue token claims the requeued job');

-- This transaction deliberately gives both claims the same now() value.
-- The queue revision still prevents an old confirmation from settling it.
with settled as (
  update printkit.print_jobs set status='failed'
  where id='9c999999-9999-4999-8999-999999999993'
    and location_id='9c999999-9999-4999-8999-999999999992'
    and status='sent' and sent_at=now() and requeued_at is null returning id
) select is((select count(*) from settled),0::bigint,'stale same-job confirmation cannot settle a newer queue revision');
with settled as (
  update printkit.print_jobs set status='printed'
  where id='9c999999-9999-4999-8999-999999999993'
    and location_id='9c999999-9999-4999-8999-999999999992'
    and status='sent' and sent_at=now() and requeued_at=now()+interval '1 microsecond' returning id
) select is((select count(*) from settled),1::bigint,'current revision confirmation settles its claimed attempt');
with settled as (
  update printkit.print_jobs set status='failed'
  where id='9c999999-9999-4999-8999-999999999993'
    and location_id='9c999999-9999-4999-8999-999999999992'
    and status='sent' and sent_at=now() and requeued_at=now()+interval '1 microsecond' returning id
) select is((select count(*) from settled),0::bigint,'opposite terminal confirmation cannot overwrite a printed attempt');

update printkit.print_jobs set status='queued',sent_at=null,requeued_at=null,created_at=now()-interval '31 minutes' where id='9c999999-9999-4999-8999-999999999993';
select is((select count(*) from printkit.claim_cloud_poll_job('9c999999-9999-4999-8999-999999999992','9c999999-9999-4999-8999-999999999993',now()-interval '31 minutes',null)),0::bigint,'revision wrapper retains the existing claim expiry boundary');

reset role;
select * from finish();
rollback;
