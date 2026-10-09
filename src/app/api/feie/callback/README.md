# callback

## Purpose

Where Feie reports a print result for a job printkit handed it.

## Contents

- `route.ts` — `POST`, form-encoded. Verifies Feie's SHA256withRSA
  signature over the sorted `name=value&...` string with
  `FEIE_CALLBACK_PUBLIC_KEY`, then marks the job `printed` or `failed`.
  Answers the literal `SUCCESS` Feie waits for, including for an order that
  is not printkit's, so Feie stops retrying it. An unsigned or badly signed
  request changes nothing.
- `route.test.ts` — valid, failed, forged, wrongly built and unsigned
  callbacks, a missing key, and an unknown order.

## Parent

[feie](../README.md)

Persistence errors return HTTP 500 so Feie retries. Unknown, requeued and
already-settled jobs are acknowledged without another write. The write checks
both the current sent state and the signed driver reference atomically, so a
callback cannot settle a different delivery attempt after the lookup.

Callback form bodies are capped at 16 KiB of streamed bytes before RSA verification or database lookup. Both multipart and URL-encoded forms retain their signature semantics; oversized input returns 413 regardless of Content-Length.
