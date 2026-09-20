# virtual-printer

## Purpose

A printer made of HTML, for development and preview only. It speaks the
same CloudPRNT exchange a real Star printer does, against the same
`/api/cloudprnt/[token]` endpoint, so the whole path (order placed, job
queued, claimed, rendered, confirmed, status reported back to the calling
kit) can be proven before any hardware is bought.

It is not linked from the dashboard navigation, and the page returns 404
when `VERCEL_ENV === "production"`.

## Contents

- `page.tsx` — server page. Blocks production, loads the vendor's active
  locations, and explains what the page is. Shows a hint instead of the
  panel when the vendor has no printing-enabled booth.
- `actions.ts` — `startVirtualPrinter(locationId)`. Blocks production,
  verifies the booth belongs to the caller, refuses a booth that already
  has a real printer, creates (or reuses) a `virtual` catalog printer for
  it, and returns a freshly minted device token.
- `virtual-printer-panel.tsx` — the printer itself: polls every 3 seconds,
  downloads the PNG when a job is ready, renders it on screen and confirms
  it with a success code. One poll at a time, so a slow render cannot
  overlap the next tick. The token lives in component state only.
- `virtual-printer-panel.dom.test.tsx` — idle state, a full job round trip
  (poll, fetch, render, confirm), and the error path.

## Connectivity

Calls `/api/cloudprnt/[token]` exactly as a physical printer would. Depends
on `@/lib/printers` (printer creation) and `@/lib/device-credentials`
(token minting).

## Parent

[dashboard](../../README.md)
