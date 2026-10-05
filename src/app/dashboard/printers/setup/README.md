# setup

## Purpose

The setup wizard for the chosen printer, one flow per kind of printer.

## Contents

- `page.tsx` — resolves the booth and catalog entry.
- `setup-wizard.tsx` — cloud printer (copy its private address), brand-cloud
  printer (SN and KEY), Bluetooth (a Chrome helper device: an Android
  phone, a Windows laptop or a Mac, never an iPad, or a Raspberry Pi
  pairing code), each ending in a live wait for the printer's first check-in.
- `actions.ts` — the server actions behind each step. Each re-checks the
  booth belongs to the caller. The printer address needs an absolute
  origin (`@/lib/site-url`), and setup refuses rather than hand out a
  relative one.

## Parent

[printers](../README.md)
