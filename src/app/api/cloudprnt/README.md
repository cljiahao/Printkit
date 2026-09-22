# cloudprnt

## Purpose

The device-facing endpoint for `cloud_poll` printers: one URL per printer,
handling the printer's poll, its job download and its result confirmation.
This is the only route in printkit that a physical printer talks to
directly, and the only one authenticated by a URL token rather than a
vendor session or a kit secret.

## Contents

- `[token]/route.ts` — `POST` (poll), `GET` (fetch a job) and `DELETE`
  (confirm). `token` is the printer's credential: it is hashed and resolved
  to a printer row, and nothing else in the request is trusted. Every
  method runs the location's lazy sweep and updates the printer's health
  before doing its own work.
  - `POST` answers whether a job is waiting. It never claims, because a
    printer that asks and then never comes back must not burn the job.
  - The first device to poll is bound to the printer by the id it reports.
    A different device presenting the same token gets 401 and an
    `admin_audit` row.
  - `GET` claims the job named by the `token` query parameter (CloudPRNT's
    echo of the poll's `jobToken`, not the URL token) through `claim_job`,
    so a second fetch of the same job gets 404. That is the double-print
    guard.
  - `DELETE` verifies the job is at this printer's location and still
    `sent` before recording `printed` or `failed`, so a late confirmation
    cannot overwrite a requeued job.

## Connectivity

Delegates wire format to `@/lib/connectors/cloud-poll/*` and job state to
`@/lib/job-dispatch.ts` and `@/lib/print-jobs.ts`. The vendor-facing setup
screen that hands a vendor this URL is `dashboard/printers/setup`.

## Parent

[api](../README.md)
