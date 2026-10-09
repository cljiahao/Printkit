# result

## Purpose

Where the agent reports whether a claimed job printed.

## Contents

- `route.ts` — `POST {result, sent_at}` (`printed` or `failed`), bearer device token. Only settles a job
  that belongs to this printer and is still `sent`. Tested in
  `../../../route.test.ts`.

## Parent

[bridge-agent](../../../README.md)

Location and sent state are rechecked in the UPDATE itself. A failed save
returns HTTP 500 instead of acknowledging a result that was not recorded.

Results must include `sent_at` copied exactly from the claimed next-job response.
The location, sent state and attempt timestamp are rechecked in the UPDATE.
An identical terminal result for the same attempt is acknowledged without a
second write or callback. An older attempt or opposite terminal result is rejected.
Missing or malformed timestamps fail closed with HTTP 400.
