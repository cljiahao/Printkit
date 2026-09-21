# result

## Purpose

Where the agent reports whether a claimed job printed.

## Contents

- `route.ts` — `POST {result}` (`printed` or `failed`), bearer device token. Only settles a job
  that belongs to this printer and is still `sent`. Tested in
  `../../../route.test.ts`.

## Parent

[bridge-agent](../../../README.md)
