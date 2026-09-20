# status

## Purpose

`GET /api/v1/print-locations/status?source_ref=<ref>` — a calling kit asks
whether one of its own locations has a printer set up, and whether that
printer is currently reachable. qkit's booth Printing section renders this
directly.

It exists so a calling kit never needs printkit's Supabase realtime
channels (or its database) to show printer status: one bearer-authed HTTP
read, same as every other cross-kit call.

## Contents

- `route.ts` — `GET`. Verifies the caller with `verifyKitAuth` (401
  otherwise), requires `source_ref` (400 otherwise), and resolves it
  through `resolveActiveLocation` scoped to the calling kit's own slug, so
  one kit can never read another kit's location. Runs `sweepLocation` for
  that location as a side effect, which is what applies job expiry and
  unconfirmed-send timeouts without a scheduler.

Responses:

```json
{ "printer": null }
```

for an unknown location or one with no printer yet, or:

```json
{
  "printer": {
    "display_name": "Feie FP-N20H",
    "catalog_id": "feie-fp-n20h",
    "connector": "vendor_cloud",
    "state": "online",
    "last_seen_at": "2026-09-20T10:15:00Z",
    "hardware_verified": false
  }
}
```

`state` is `online` when the printer was seen inside the last 60 seconds,
otherwise `offline`. `hardware_verified` is false until Merqo has tested
that model's driver on a real unit, so a kit can label it honestly.

## Connectivity

Reads `../../../../lib/printers.ts` (printer row and health),
`../../../../lib/job-dispatch.ts` (the sweep) and
`../../../../lib/printer-catalog.ts` (the hardware-verified flag).

## Parent

[print-locations](../README.md)
