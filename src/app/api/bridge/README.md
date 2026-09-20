# bridge

## Purpose

What a Bluetooth bridge device downloads to print. The bridge renders
nothing itself, so a Bluetooth printer produces the same label as a cloud
printer: printkit draws it, the device only pushes bytes over Bluetooth.

These routes are authenticated by the vendor's own session, because the
Android bridge is the vendor's browser. The Raspberry Pi agent has its own
token-authenticated endpoints under `../v1/bridge-agent/`.

## Contents

- `jobs/[id]/label/route.ts` — `GET /api/bridge/jobs/[id]/label`. Reads the
  job through the vendor's session client, so `print_jobs`' RLS policy
  decides whose job it is rather than a filter written here. Renders at the
  booth printer's own label size and dpi. Anything the caller may not see,
  a job with no booth, or a booth with no printer all answer 404 alike, so
  the route never reveals which of those it was.
- `sample-label/route.ts` — `GET /api/bridge/sample-label?location=<id>`.
  The test print during setup: a sample label built by the same builder a
  real order uses, at that booth's own size, so what a vendor checks is what
  an order will produce.

## Parent

[api](../README.md)
