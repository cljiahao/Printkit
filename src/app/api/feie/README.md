# feie

## Purpose

Inbound callbacks from Feie, the printer maker whose cloud printkit pushes
jobs to. Feie reports each print result here, which is how a `vendor_cloud`
job normally reaches `printed` or `failed` without printkit polling for it.

## Contents

- `callback/route.ts` — `POST /api/feie/callback`. Form-encoded, verified
  with SHA256withRSA over `orderId` + `status` + `stime` against
  `FEIE_CALLBACK_PUBLIC_KEY`. Anything unsigned, badly signed, or arriving
  while no public key is configured answers 401 and changes nothing: the
  route is reachable by anyone, so an unverified callback could otherwise
  mark a vendor's labels printed. A callback for a job printkit does not
  recognise answers 200 without changing anything, so the maker stops
  retrying it.

The lost-callback fallback lives in the sweep
(`reconcileVendorCloudJob`), which asks Feie directly about jobs still
`sent` after a minute.

## Parent

[api](../README.md)
