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
  device binding), answers `{jobReady}` with `image/png` and an opaque queue-revision
  `jobToken`, and reads the confirmation `DELETE`'s `code`. Star's protocol
  reference sends a URL-encoded status such as `200 OK` or `511 Media
Decoding Error` and treats anything not starting with `2` as not printed;
  a missing code or a bare `OK` also counts as printed. CloudPRNT v2 (MQTT,
  "CloudPRNT Next") is out of scope: the mC-Label2 supports both.
- `drivers.ts` — the drivers built for this connector, registered once on
  import. `getCloudPollDriver(id)` returns null for a catalog entry whose
  driver does not exist yet, which the route turns into a 401 rather than a
  crash.
- `service.ts` — resolves printer credentials, renders labels, reads only
  the printer's current token-bound job revision, claims that revision through
  the service-only RPC, and records device audit events.
- `job-token.ts` — validates and derives the versioned job/queue-revision
  token using exact creation/requeue timestamps without Date conversion.

## Firmware and deployment

Job-token support is required. Missing tokens and old bare job IDs cannot
identify a queue revision safely and are rejected for fetch and confirmation.
Apply migration 0009 before deploying the route, pause devices and drain or
discard outstanding legacy jobs, then restart devices for fresh poll tokens.
Upgrade older firmware before resuming; the endpoint's README lists the
vendor-documented minimum versions. Confirm token echoing with actual hardware.

## Connectivity

Driven by `src/app/api/cloudprnt/[token]/route.ts`. Depends on
`../../printers.ts`, `../../job-dispatch.ts`, `../../device-credentials.ts`,
`../../label-layout.ts` and `../../label-raster.ts`.

## Parent

[connectors](../README.md)
