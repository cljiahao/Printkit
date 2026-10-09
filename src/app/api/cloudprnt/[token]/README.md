# [token]

## Purpose

One CloudPRNT printer's own endpoint. The URL segment is the printer's
credential, so each printer gets a private address at setup.

## Contents

- `route.ts` — `POST` poll, `GET` job fetch (claims the job), `DELETE`
  confirmation. Both fetch and confirmation require the opaque revision token
  advertised by polling. Missing, stale and legacy job-ID tokens fail closed.
  See `../README.md` for the full flow.
- `route.test.ts` — every method against mocked services, including a bad
  token, a hardware mismatch, another printer's job and token-less firmware.

## Parent

[cloudprnt](../README.md)

Confirmation updates recheck location and sent state atomically. A failed
save returns HTTP 500, so device firmware can retry the confirmation.

The token binds the job ID and exact creation/requeue timestamps. The new
service-only `claim_cloud_poll_job` RPC locks that advertised revision before
delegating to `claim_job`, so expiry and single-claim logic stay centralized.
Confirmation binds the current sent and requeue timestamps in the UPDATE.
An identical terminal retry succeeds without another callback.

Deploy migration 0009 before the route. Pause devices and drain or discard
outstanding old-token jobs during rollout; restart devices to obtain new
tokens. Upgrade firmware without token support: IFBD-HI01X/HI02X requires
1.8+, mC-Print2/3 requires 3.2+, TSP100IV requires 1.0+, TSP100IV SK
requires 2.0+, and mC-Label2/3 requires 1.0+. There is no token-less fallback.
Verify GET/DELETE echo behavior on each actual supported printer before
production rollout.

[Star's protocol reference](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/server-polling-post/json-response.html)
permits arbitrary server-assigned jobToken strings and describes firmware
support. Its [confirmation reference](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/job-confirmation-delete/index.html)
requires the same token as GET and describes confirmation retries.

Authenticated poll JSON is capped at 64 KiB of streamed bytes and returns 413 when oversized. Empty or malformed small poll bodies retain the existing protocol fallback.
