# cloud-poll

## Purpose

The connector for printers that fetch their own work: the printer holds a
URL, polls it every few seconds, downloads whatever job is waiting and
reports the result. No helper device and no app, which is what makes this
the path for a vendor running an iPad only.

The connector owns everything generic (credential check, lazy sweep, health,
peek, claim, rendering, confirmation). A driver owns one brand's wire
format only.

## Contents

- `star-cloudprnt.ts` — Star CloudPRNT v1 over HTTP: parses the poll's JSON
  body (normalising `printerMAC` so case and separators cannot fork the
  device binding), answers `{jobReady}` with `image/png` and the job id as
  `jobToken`, and reads the confirmation `DELETE`'s `code`. A missing code,
  `OK`, or anything starting with `2` counts as printed; everything else
  fails the job and is logged. Star's exact codes are unverified until the
  hardware gate, which checks this mapping first. CloudPRNT v2 (MQTT) is
  out of scope.
- `drivers.ts` — the drivers built for this connector, registered once on
  import. `getCloudPollDriver(id)` returns null for a catalog entry whose
  driver does not exist yet, which the route turns into a 401 rather than a
  crash.
- `service.ts` — `resolveDevice` (URL token to printer, by hash, refusing a
  printer on another connector), `renderJobPng` (label at the printer's own
  size and dpi), `jobBelongsToLocation` (so a device cannot confirm another
  printer's job) and `logDeviceEvent` (audit trail for a token presented by
  unexpected hardware).

## Connectivity

Driven by `src/app/api/cloudprnt/[token]/route.ts`. Depends on
`../../printers.ts`, `../../job-dispatch.ts`, `../../device-credentials.ts`,
`../../label-layout.ts` and `../../label-raster.ts`.

## Parent

[connectors](../README.md)
