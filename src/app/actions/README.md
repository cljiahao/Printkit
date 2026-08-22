# actions

## Purpose

Server actions backing Sheet-embedded widgets on the dashboard nav (not full
pages) — hence each does its own inline session check rather than the
redirecting `getVendorSession()` guard.

## Contents

- `feedback.ts` — `submitFeedbackAction`: vendor NPS feedback, via the
  shared cross-kit `merqo.submit_vendor_feedback` RPC.
- `support.ts` — `submitSupportMessageAction`: vendor "Get help" message,
  via the shared cross-kit `merqo.submit_support_message` RPC.

## Parent

See [../README.md](../README.md).
