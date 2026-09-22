# [token]

## Purpose

One CloudPRNT printer's own endpoint. The URL segment is the printer's
credential, so each printer gets a private address at setup.

## Contents

- `route.ts` — `POST` poll, `GET` job fetch (claims the job), `DELETE`
  confirmation. Firmware that sends no job token still works: a token-less
  fetch claims the oldest waiting job, a token-less confirmation settles the
  last one sent. See `../README.md` for the full flow.
- `route.test.ts` — every method against mocked services, including a bad
  token, a hardware mismatch, another printer's job and token-less firmware.

## Parent

[cloudprnt](../README.md)
