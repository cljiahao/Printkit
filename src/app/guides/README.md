# guides

## Purpose

Public help pages, outside `/dashboard` so support, qkit and a printer's own
setup screen can link straight to them without a vendor having to be signed
in first.

## Contents

- `bluetooth-printers/page.tsx` — the Bluetooth setup guide. It opens by
  saying Merqo does not recommend this path and why, because the honest
  warning is the most useful thing on the page for a vendor still choosing a
  printer. Then: why a Bluetooth printer needs a second device at all, the
  Android phone steps (including turning Battery Saver off, which printkit
  cannot override), the Raspberry Pi steps with the real commands, and
  troubleshooting written as the symptoms a vendor actually sees rather than
  error codes.

This is the one Read-mode surface in printkit: it is prose, sized for
comprehension, not a dashboard screen.

## Parent

[app](../README.md)
