# accept

## Purpose

The legal-acceptance interstitial a signed-in vendor is redirected to when
their accepted terms/privacy versions are behind `@merqo/ui`'s
`LEGAL_VERSIONS`. printkit owns no acceptance record — merqo does — so this
folder's job is entirely to collect the vendor's consent and forward it.

## Contents

- `page.tsx` — `LegalAcceptPage`. Reads the `next` search param (through
  `safeRedirectPath`, `@/lib/safe-redirect`) and renders the client form.
  Deliberately runs no legal-gate check itself — it is what the gate
  redirects to, so gating it would loop.
- `accept-form.tsx` — `AcceptForm`, a client component wrapping `@merqo/ui`'s
  `TermsAcceptanceCheckbox` (just the agree checkbox — no typed name); the
  submit button is disabled until it's checked. Posts to `acceptLegalTerms`.
- `actions.ts` — `acceptLegalTerms` server action. Re-checks for a signed-in
  user (redirects to `/login` otherwise), reads the vendor's real
  `ip`/`user_agent`, then `POST`s `/api/merqo/legal-accept` on merqo once
  per doc type (`terms`, `privacy`), each independent so a
  duplicate-acceptance conflict on one never blocks the other. On success
  it primes the local `legal_check_state` cache and redirects to a
  `safeRedirectPath`-checked `next` (default `/dashboard`).
- `actions.test.ts` — covers the two independent posts, the cache prime,
  `next`-param safety, the no-user/missing-secret branches, and a
  non-2xx throw.

## Parent

[legal](../README.md)
