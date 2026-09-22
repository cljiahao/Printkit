# printers

## Purpose

Where a vendor chooses a printer for a booth and gets it printing. It is
the main entry point of the dashboard, in place of the old bridge-only
screen, because most vendors now use a printer that needs no bridge at all.

Everything a vendor reads here avoids printkit's own vocabulary: no
connector, driver, endpoint or poll. A booth has a printer, and the printer
is online or it is not.

## Contents

- `page.tsx` — one row per booth: the printer, whether it is online (from
  the shared `last_seen_at` signal), what kind it is in plain words, and the
  one action that makes sense next. A booth with no printer offers only
  "Choose a printer"; a Bluetooth booth also offers Bridge mode.
- `new/page.tsx` and `new/printer-picker.tsx` — the picker. Cards come from
  the static catalog, filtered by "works with iPad alone" (on by default,
  because that is the recommendation), connection, and the label width a
  stall actually buys; sorted by recommendation (iPad alone with no
  monthly cost first and cheapest first, then 4G printers with a data plan,
  then Bluetooth, from `compareRecommended`), setup effort or price. Each
  card states its monthly cost.
  Every badge carries an `InfoButton`, so a vendor can find out what "4G" or
  "untested" means without leaving the page. A Bluetooth card says it is the
  most setup and links to the guide before the vendor can continue.
- `setup/page.tsx`, `setup/setup-wizard.tsx`, `setup/actions.ts` — one
  wizard per kind of printer, each a short numbered list ending in a live
  wait that turns into "Connected" when the printer first reports in:
  - Cloud printer: mint this booth's private printer address once, copy it,
    paste it into the printer's own settings page.
  - Brand-cloud printer: insert a SIM or join WiFi, then type the SN and KEY
    off the device. The KEY is used once to claim the printer and never
    stored.
  - Bluetooth printer: choose Android (continue in Bridge mode) or Raspberry
    Pi (show a single-use pairing code), after a banner that says this is
    not recommended.

  Every action re-derives that the booth belongs to the caller, and refuses
  a booth that already has a different printer rather than silently
  re-pointing it.

## Connectivity

Reads `@/lib/printer-catalog`, `@/lib/printers` and `@/lib/printer-info-copy`;
writes through `@/lib/device-credentials`, `@/lib/bridge-pairing` and the
vendor-cloud driver. Links out to `/guides/bluetooth-printers` and
`/dashboard/bridge`.

## Parent

[dashboard](../README.md)
