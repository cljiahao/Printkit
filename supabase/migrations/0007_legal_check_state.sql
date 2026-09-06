-- Local TTL cache for "has this email's legal-doc acceptance been confirmed
-- current recently?". printkit does not own the acceptance record — merqo
-- does (merqo.legal_acceptances) — so confirming currency means an HTTP call
-- to merqo's GET /api/merqo/legal-status. That check runs on every gated
-- dashboard render, so the result is cached here for a short TTL, mirroring
-- merqo's own vendor_sync_state throttle table.
--
-- Written and read only by the service-role client (src/lib/legal-gate.ts);
-- never reached from a browser path, so it follows the same RLS-on /
-- no-client-policy / explicit-service_role-grant shape as kit_api_keys (0001)
-- and every other service-role-only table in this schema.

CREATE TABLE printkit.legal_check_state (
  email      TEXT        PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_current BOOLEAN     NOT NULL
);

ALTER TABLE printkit.legal_check_state ENABLE ROW LEVEL SECURITY;
-- No policies: only the service-role client touches it (RLS on + no policy =
-- deny all direct anon/authenticated access).

GRANT SELECT, INSERT, UPDATE ON printkit.legal_check_state TO service_role;
