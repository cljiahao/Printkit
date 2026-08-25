-- Adds an optional outbound-callback contract to kit_api_keys, alongside its
-- existing inbound bearer-secret verification (secret_hash). These are two
-- different directions and can't share a column: secret_hash verifies a
-- secret THIS kit presents to printkit (only ever needs to be hashed and
-- compared, never read back); callback_secret is a secret PRINTKIT presents
-- to that kit's own callback route, so it must be stored in a form printkit
-- can actually send — plaintext, same trust level as the equivalent
-- NEXT_PUBLIC_QKIT_URL/QKIT_CALLBACK_SECRET env vars this replaces, and
-- gated the same way (service_role only, no RLS policy grants anon/
-- authenticated any access to this table at all).
--
-- Both columns are nullable: a calling kit that never needs a print-status
-- callback (fire-and-forget only, no status route of its own) simply leaves
-- them unset, and printkit's outbound notifier already fails open on a
-- missing config (see notifyKitPrintStatus in src/lib/kit-callback.ts).
--
-- callback_url is the calling kit's FULL endpoint URL (not just an origin) --
-- generalizes away the hardcoded "/api/printkit/print-status" path append
-- that only worked because qkit was the one and only caller.
alter table printkit.kit_api_keys
  add column callback_url text,
  add column callback_secret text;
