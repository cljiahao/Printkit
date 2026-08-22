# printkit — Deploy Notes

printkit runs on its **own Supabase project** (not shared with qkit/loopkit/
paykit/merqo), Vercel-deployed from `github.com/cljiahao/Printkit`.

## First deploy

1. Create a Supabase project for printkit. Link it and apply migrations in
   order (`supabase link --project-ref <ref>` then `supabase db push`) —
   `0001_printkit_core.sql` through `0004_printkit_realtime.sql`.
2. Set Vercel env vars (see `.env.example` / `src/lib/env.ts` for the
   authoritative list):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
     `SUPABASE_SECRET_KEY` — this project's own values.
   - `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` — set to `.merqo.io` in Production
     only; leave unset in Preview (it doesn't run on merqo.io — setting it
     there breaks login instead of just failing to share it).
   - `QKIT_CALLBACK_SECRET` — a fresh random value (e.g. `openssl rand -hex
32`). Must equal qkit's `PRINTKIT_CALLBACK_SECRET`.
   - `NEXT_PUBLIC_QKIT_URL` — qkit's deployment URL (`https://qkit.merqo.io`).
3. Mint qkit's inbound bearer secret: run `scripts/create-kit-key.mjs qkit`
   (needs `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SECRET_KEY` in the shell env,
   or run the equivalent insert directly in the Supabase SQL editor — see
   the script's own comment for the query shape). The printed secret goes
   into qkit's `PRINTKIT_KIT_SECRET` (raw, no `kit_slug:` prefix — qkit's
   own client code adds that).
4. On qkit's side, set `NEXT_PUBLIC_PRINTKIT_URL` to this deployment's URL.

## Notes

- The qkit↔printkit cross-kit integration (order-placed job creation,
  print-status callback, manual reprint) is fully built — Plans 1-4 are
  complete. The only remaining v0.1 step is the manual hands-on hardware
  test with a real NIIMBOT B1.
- Two independent secret pairs, do not mix up: `PRINTKIT_KIT_SECRET`
  (qkit→printkit, "create a job") is unrelated to `QKIT_CALLBACK_SECRET`/
  `PRINTKIT_CALLBACK_SECRET` (printkit→qkit, "job printed/failed").
