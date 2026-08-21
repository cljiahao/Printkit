# supabase

## Purpose

The three Supabase client constructors, each scoped to the `paykit` schema
and to one specific execution context — client component, server
(session-scoped), and middleware. Getting the wrong one in the wrong
context is either a build error (browser APIs on the server) or an RLS
bypass (service client where a session client belongs), so the split is
deliberate.

## Contents

- `client.ts` — `createClient()`: browser client for Client Components,
  built with `NEXT_PUBLIC_SUPABASE_*` (publishable key, RLS-enforced).
  Passes `cookieOptions: { domain: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN }`
  when that env var is set (Vercel Production only), scoping the auth
  cookie to `.merqo.io` so a session carries across every Merqo kit.
- `server.ts` — `createServerClient()`: session-scoped server client
  (cookie-backed via `next/headers`, RLS-enforced) for Server Components/
  Actions/Route Handlers acting as the signed-in vendor, same conditional
  `cookieOptions.domain` as `client.ts`.
  `createServiceClient()`: service-role client that **bypasses RLS** —
  only for Server Actions/Route Handlers that must act across vendors
  (the `/api/v1/*` cross-kit API, admin-style reads). Never import this
  into a client component. `cookieOptions` intentionally omitted here —
  it never writes session cookies.
  Both are generic over `Database`/`"paykit"` (see `@/lib/types`).
- `middleware.ts` — `updateSession(request)`: refreshes the Supabase
  session cookie and redirects unauthenticated requests to `/dashboard/*`
  (`isProtectedPath`) to `/login`. Called from `src/proxy.ts`. Also runs
  `clearLegacyHostOnlyCookie()`: a vendor signed in before the `.merqo.io`
  cookie domain shipped has a HOST-ONLY version of the same-named auth
  cookie, which the browser and Next's cookie parser can disagree on (RFC
  6265 ordering) once the domain-scoped one also exists — the helper
  clears the host-only one once per browser (guarded by a
  `sb-auth-cookie-domain-migrated` marker cookie), skipping any cookie
  name `@supabase/ssr`'s own `setAll` just wrote this same request so it
  never clobbers a same-request token refresh.

## Connectivity

`proxy.ts` calls `updateSession` on every request. Server Components/
Actions call `createServerClient`/`createServiceClient`; Client Components
call `createClient`.

## Parent

[lib](../README.md)
