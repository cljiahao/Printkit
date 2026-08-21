# login

## Purpose

The single sign-in/sign-up page (`/login`) — email+password and Google
OAuth, plus password reset. No separate `/signup` or `/reset-password`
route; mode is a client-side toggle on this one page.

## Contents

- `page.tsx` — `LoginPage()` wraps the actual `LoginForm` client component
  in `<Suspense>` (it reads `useSearchParams()` for `?error=oauth`).
  `LoginForm` handles:
  - Google OAuth via `supabase.auth.signInWithOAuth`, redirecting through
    `/auth/callback`; `queryParams: { hl: "en" }` forces an English consent
    screen regardless of the visitor's browser/account locale.
  - Email+password sign-in/sign-up via `supabase.auth.signInWithPassword`/
    `signUp`. A sign-up that returns no session (email confirmation on)
    shows a "Check your email" state instead of silently redirecting to a
    dashboard the unconfirmed user can't reach yet; "Back to sign in"
    returns to the normal form in sign-in mode.
  - "Forgot password?" (sign-in mode only) calls
    `supabase.auth.resetPasswordForEmail`, toasting an error if the email
    field is empty or the call fails, and a success toast otherwise. The
    reset link lands on `/auth/callback`, which establishes a recovery
    session and forwards to `/dashboard/profile`, where "Change password"
    already lets a signed-in (recovery counts) user set a new one — no
    separate reset-password page needed.
  - `Wordmark` (`@/components/landing/wordmark`) and `GoogleMark`
    (`./google-mark`) brand the card; the card container is `ElevatedCard`
    (`@/components/elevated-card`), matching every other kit's login page.
- `google-mark.tsx` — `GoogleMark`: the Google "G" icon SVG, extracted out
  of `page.tsx` so it matches the shared component used across every kit's
  login page.
- `page.test.tsx` — RTL/jsdom tests: the `?error=oauth` banner, the
  check-your-email state on a sessionless sign-up (and returning from it via
  "Back to sign in"), the redirect-on-session-present path, and the Forgot
  password flow (visible only in sign-in mode, sends a reset email, toasts
  an error on an empty email or a failed reset call).
- `login-page.dom.test.tsx` — RTL/jsdom test asserting the page renders a
  single top-level heading alongside the Google and email/password form.

## Connectivity

Signed-out visitors land here from `landing/nav.tsx`'s "Log in"/"Get
started" links. On success it calls `router.push("/dashboard")` +
`router.refresh()`; `/dashboard`'s `layout.tsx` (`getVendorSession()`) is
the actual auth gate this page's happy path leads into.

## Parent

[paykit](../../../README.md)
