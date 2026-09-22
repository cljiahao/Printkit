# connectors

## Purpose

The driver layer for the three ways a print job can reach a printer, per
`docs/superpowers/specs/2026-09-20-printer-connectors-design.md`:

| Connector      | Who opens the connection              | Example        |
| -------------- | ------------------------------------- | -------------- |
| `cloud_poll`   | The printer asks printkit for work    | Star CloudPRNT |
| `vendor_cloud` | printkit calls the maker's cloud API  | Feie 4G        |
| `bridge`       | A helper device relays over Bluetooth | NIIMBOT B1     |

A connector owns what is common to its delivery style: authenticating the
device, handing the job over, status transitions and the health signal. A
driver owns only one brand's wire format. That split is what makes a new
printer cheap: a new model of a supported brand is one catalog entry, and a
new brand is one driver file inside an existing connector.

## Contents

- `types.ts` — `DriverMeta` plus the three driver interfaces
  (`CloudPollDriver`, `VendorCloudDriver`, `BridgeDriver`) and their shared
  result types. `outputFormat` says what a driver needs from a label layout:
  `png` (rasterized by `../label-raster.ts`) or `markup` (translated into
  the brand's own tag language, because some printers cannot accept a
  full-label image).
- `registry.ts` — `registerDriver`/`getDriverMeta`/`listDriverMeta`/
  `isDriverAvailable`: driver id to metadata. Registering the same id twice
  throws rather than silently replacing a driver. `isDriverAvailable` is how
  the printer picker tells a catalog entry whose driver exists from one that
  is still just a plan. `resetDriverRegistry` is test-only.

One subfolder per connector (`cloud-poll/`, `vendor-cloud/`, `bridge/`)
arrives with each connector's own phase; none exist yet.

## Connectivity

Consumed by each connector's routes and by the printer picker. Depends on
`../printer-catalog.ts` for `ConnectorId` and on `../label-layout.ts` for
the layout a driver renders.

## Parent

[lib](../README.md)
