# print-locations

## Purpose

Inbound `POST` route calling kits use to register or update a "print
location" — an opaque, labeled routing point (e.g. one of qkit's booths)
that a vendor can later pair a physical bridge/printer device to.

## Contents

- `route.ts` — `POST /api/v1/print-locations`. Verifies the caller's
  bearer secret via `verifyKitAuth` (`@/lib/kit-auth`), validates the body
  with Zod (`vendor_id` UUID, `source_ref`, `label`, `active`), then
  delegates to `createOrUpdatePrintLocation` (`@/lib/print-locations`),
  which upserts on `(source_kit, source_ref)` — safe to call repeatedly
  (e.g. every time a vendor saves booth settings). Returns 401
  unauthenticated, 400 invalid body, 201 with the row's `id` on success,
  or the lib function's own error status/message on failure.
- `route.test.ts` — auth rejection, body validation, success, and the
  pass-through error-status case.

## Connectivity

Calls `createOrUpdatePrintLocation` (`@/lib/print-locations`), which
writes to the `print_locations` table
(`supabase/migrations/0005_print_locations.sql`). `POST /api/v1/print-jobs`
(`../print-jobs/route.ts`) resolves a job's `location_ref` against rows
this route creates.

## Parent

[src/app](../../../README.md)
