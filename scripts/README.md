# scripts

## Purpose

One-off operator scripts, run by hand against the real Supabase project —
never invoked by the app itself.

## Contents

- `create-kit-key.mjs` — mints a bearer secret for a new calling kit,
  stores its SHA-256 hash in `printkit.kit_api_keys`
  (`0001_printkit_core.sql`), and prints the plaintext secret once — that
  kit's own secret store is the only other place it should ever live.
  Optional trailing `callback_url`/`callback_secret` args populate that
  kit's outbound status-callback config (`0006_kit_api_keys_callback.sql`,
  used by `src/lib/kit-callback.ts`) — both stored in plaintext, since
  printkit must present them itself, unlike the hashed inbound secret.
  Usage: `node scripts/create-kit-key.mjs <kit_slug> [callback_url] [callback_secret]`.
  Omitting the trailing args on a re-run (e.g. rotating just the inbound
  secret) leaves any existing callback config untouched.

## Parent

[repo root](../README.md)
