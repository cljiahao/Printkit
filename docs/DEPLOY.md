# paykit — Deploy Notes

paykit runs on the **shared Merqo Supabase project** (same one as
qkit/loopkit/merqo), in its own `paykit` schema.

## First deploy

1. Add `paykit` to the Supabase project's exposed schemas (Data API config)
   so `@supabase/ssr` can query it.
2. Apply `supabase/migrations/0001_paykit_core.sql`.
3. Set Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (shared
   creds — same values as qkit/loopkit's own Vercel projects).
4. No calling kit is wired up yet in this scope — `scripts/create-kit-key.mjs`
   only needs to be run once a real cutover spec (see the design spec's
   Follow-ups) actually connects a kit to paykit.

## Notes

- paykit never touches funds — there is no payment-provider webhook to
  configure.
- The dashboard profile page (`/dashboard/profile`) reads/writes the shared
  `merqo.vendor_profile` table (stall/shop name, social links) and uploads
  profile-icon photos to the shared `vendor-images` Storage bucket. Neither
  needs a paykit-local migration — both were created once, project-wide, by
  loopkit's `0017_loopkit_vendor_profile.sql`, and are already live on the
  shared Supabase project by the time paykit deploys.
- Cutting qkit (or any other kit) over to call paykit, and removing qkit's
  local payment duplicate, is separate, later work — not part of this
  deploy.
