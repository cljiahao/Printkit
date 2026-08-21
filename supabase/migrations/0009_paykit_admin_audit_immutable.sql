-- 0009 — admin_audit immutability: the app only ever INSERTs audit rows
-- (see recordAudit() in src/app/admin/actions.ts and its reuse from
-- src/app/dashboard/transactions/actions.ts) and RLS already blocks
-- authenticated/anon from reading anyone else's rows, let alone writing —
-- but nothing stops the service-role client itself from UPDATEing or
-- DELETEing a row after the fact, which defeats the point of an audit
-- trail. 0006_paykit_admin.sql's `grant all on ... to service_role` is
-- narrowed here to select/insert only. This changes no application
-- behavior: no code path ever updates or deletes admin_audit.
revoke update, delete on paykit.admin_audit from service_role;

-- Re-state what's kept, for clarity when reading this migration in isolation.
grant select, insert on paykit.admin_audit to service_role;
