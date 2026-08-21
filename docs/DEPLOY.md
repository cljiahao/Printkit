# printkit — Deploy Notes

printkit runs on the **shared Merqo Supabase project** (same one as
qkit/loopkit/merqo/paykit), in its own `printkit` schema.

## First deploy

1. Add `printkit` to the Supabase project's exposed schemas (Data API config)
   so `@supabase/ssr` can query it.
2. Apply the migrations in order: `supabase/migrations/0001_printkit_core.sql`
   then `supabase/migrations/0002_printkit_admin.sql`.
3. Set Vercel env vars (see `.env.example` / `src/lib/env.ts` for the
   authoritative list): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (shared
   creds — same values as the other kits' own Vercel projects),
   `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` (set to `.merqo.io` in Production only —
   leave unset in dev/preview, since those don't run on merqo.io),
   `MERQO_METRICS_SECRET`, and `MERQO_PROVISION_SECRET` (two different
   secret values — a leak of one must not grant the other's capability).
4. No calling kit is wired up yet in this scope — `scripts/create-kit-key.mjs`
   mints a hashed bearer secret for a calling kit (qkit) and only needs to
   be run once Plan 2 (a separate, not-yet-started implementation plan)
   actually wires up the real cross-kit integration.

## Notes

- Cutting qkit over to call printkit's `POST /api/v1/print-jobs` on
  order-placed, and printkit calling back into qkit on job status change,
  is Plan 2 — not part of this deploy.
