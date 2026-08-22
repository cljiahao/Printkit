# actions

## Purpose

Server actions the dashboard nav calls directly: `feedback.ts`/`support.ts`
back Sheet-embedded widgets (not full pages), so each does its own inline
session check rather than the redirecting `getVendorSession()` guard;
`auth.ts` backs sign-out from the account menu.

## Contents

- `auth.ts` — `signOutAction`: thin wrapper around Supabase
  `auth.signOut()`, redirects to `/login`. Passed to `dashboard-nav.tsx`'s
  `DashboardNav` as its `signOut` prop from `dashboard/layout.tsx`.
- `feedback.ts` — `submitFeedbackAction`: vendor NPS feedback, via the
  shared cross-kit `merqo.submit_vendor_feedback` RPC.
- `support.ts` — `submitSupportMessageAction`: vendor "Get help" message,
  via the shared cross-kit `merqo.submit_support_message` RPC.

## Parent

See [../README.md](../README.md).
