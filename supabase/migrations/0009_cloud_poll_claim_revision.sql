-- Hold the exact advertised queue revision while delegating the actual claim.
create function printkit.claim_cloud_poll_job(
  p_location_id uuid,
  p_job_id uuid,
  p_created_at timestamptz,
  p_requeued_at timestamptz
) returns setof printkit.print_jobs
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from printkit.print_jobs
    where id = p_job_id and location_id = p_location_id and status = 'queued'
      and created_at = p_created_at
      and requeued_at is not distinct from p_requeued_at
    for update skip locked;
  if not found then return; end if;
  return query select * from printkit.claim_job(p_location_id, p_job_id);
end;
$$;
revoke all on function printkit.claim_cloud_poll_job(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function printkit.claim_cloud_poll_job(uuid,uuid,timestamptz,timestamptz) to service_role;
