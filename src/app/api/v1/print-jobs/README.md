# print-jobs

## Purpose

Inbound `POST` route calling kits (qkit) use to queue a print job on
order-placed.

## Contents

- `route.ts` — `POST /api/v1/print-jobs`. Verifies the caller's bearer
  secret via `verifyKitAuth` (`@/lib/kit-auth`), validates the body with
  Zod (`vendor_id` UUID, `payload` object, `source_ref`, an optional
  `location_ref` — the calling kit's own opaque location id, e.g. qkit's
  `booths.id`, used to route the job to a specific paired bridge instead
  of just the vendor as a whole — and an optional `job_type`, passed
  through as-is; the DB column still only accepts `'label'`, this just
  keeps the API from hardcoding one job type ahead of that widening),
  then delegates to `createPrintJob`
  (`@/lib/print-jobs`). Returns 401 unauthenticated, 400 invalid body, 201
  with the new row's `id` on success, or the `createPrintJob` error's own
  status (e.g. 409 on a duplicate `source_kit`+`source_ref`). An omitted
  or unresolvable `location_ref` never fails the request — the job is
  still created, just without a `location_id`.
- `route.test.ts` — auth rejection, body validation, success, and the
  pass-through error-status case.

## Connectivity

Calls `createPrintJob` (`@/lib/print-jobs`), which resolves `location_ref`
via `resolveActiveLocation` (`@/lib/print-locations`) before inserting.

## Parent

[src/app](../../../README.md)
