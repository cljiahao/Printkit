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
  `jobToken`, and reads the confirmation `DELETE`'s `code`. Star's protocol
  reference sends a URL-encoded status such as `200 OK` or `511 Media
Decoding Error` and treats anything not starting with `2` as not printed;
  a missing code or a bare `OK` also counts as printed. CloudPRNT v2 (MQTT,
  "CloudPRNT Next") is out of scope: the mC-Label2 supports both.
- `drivers.ts` — the drivers built for this connector, registered once on
  import. `getCloudPollDriver(id)` returns null for a catalog entry whose
  driver does not exist yet, which the route turns into a 401 rather than a
  crash.
- `service.ts` — `resolveDevice` (URL token to printer, by hash, refusing a
  printer on another connector), `renderJobPng` (label at the printer's own
  size and dpi), `jobBelongsToLocation` (so a device cannot confirm another
  printer's job), `latestSentJobId` (what a token-less confirmation from
  older Star firmware refers to) and `logDeviceEvent` (audit trail for a token presented by
  unexpected hardware).

## Firmware without job tokens

Star only added the `token` query parameter in later firmware (mC-Print3
3.2+, mC-Label3 1.0+). Older firmware fetches and confirms without naming the
job, so the route claims the oldest waiting job on a token-less `GET` and
settles the location's most recently sent job on a token-less `DELETE`. A
cloud_poll printer handles one job at a time, so this is unambiguous.

## Connectivity

Driven by `src/app/api/cloudprnt/[token]/route.ts`. Depends on
`../../printers.ts`, `../../job-dispatch.ts`, `../../device-credentials.ts`,
`../../label-layout.ts` and `../../label-raster.ts`.

## Parent

[connectors](../README.md)
