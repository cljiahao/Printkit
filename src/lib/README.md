# lib

## Purpose

Framework-agnostic logic: auth/session helpers, shared types, and small
utilities. One subfolder (`supabase/`) groups the DB client cluster;
everything else sits flat here.

## Contents

- `types.ts` — hand-maintained DB types (`PrintJob`, `PrintJobType`,
  `PrintJobStatus`, `KitApiKey`, `Admin`, `AdminAuditEntry`, `Database`),
  kept in sync with `supabase/migrations/` by hand. The `Database` interface
  satisfies Supabase's `GenericSchema` constraint with proper `Tables`,
  `Views`, and `Functions` typing for the `printkit` schema.
- `kit-auth.ts` — `hashApiKey`/`verifyKitAuth`: bearer-secret verification
  for calling kits, checked on every `/api/v1/*` route before any DB access.
- `vendor-session.ts` — `getVendorSession()`: shared dashboard auth guard
  (gets a session-scoped Supabase client and the authenticated user,
  redirects to `/login` if none).
- `merqo-auth.ts` — `bearerOk`/`provisionBearerOk` (constant-time bearer-secret
  checks against `MERQO_METRICS_SECRET`/`MERQO_PROVISION_SECRET` respectively)
  — a separate auth mechanism from `kit-auth.ts`'s `verifyKitAuth` (which is
  for peer-kit-to-kit calls, keyed by `kit_api_keys`). Not yet wired to any
  route in this repo — no `/api/merqo/*` routes exist here yet.
- `brand-icon.tsx` — `brandIcon(size)` + `BRAND_MINT`/`BRAND_INK`: the
  printkit "P" mark as a `ReactElement` for `ImageResponse`-generated icons
  (favicon, apple-touch) — hex literals, not theme tokens, since
  `ImageResponse` needs concrete CSS colors. Tracks the "Banknote
  Engrave" theme's dark-mode brighter primary, so the dark-ink text on top
  stays legible.
- `action-result.ts` — `ActionResult<T>`: the discriminated
  `{success:true,...T} | {success:false,error}` shape every Server Action
  returns.
- `env.ts` — `publicEnv`: required-env-var accessors that throw at import
  time if unset, instead of silently reading `undefined`.
- `utils.ts` — `cn()` (clsx + tailwind-merge), shared form label/error
  Tailwind class constants, `formatCents()` (integer cents -> SGD currency
  string), and `formatDate()` (a `date`-column "YYYY-MM-DD" string ->
  display date, parsed/formatted with an explicit UTC anchor so it never
  shifts by a day depending on the server's runtime timezone).

## Connectivity

Consumed throughout `src/app/` (route handlers, Server Actions, dashboard
pages) and `src/components/`. `supabase/` is the one subfolder with its own
concern — see its README.

## Parent

[printkit](../../README.md)
