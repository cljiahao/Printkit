# new

## Purpose

The printer picker: choose a model for a booth from the catalog.

## Contents

- `page.tsx` — loads the booth and the catalog (dev-only entries only in
  development).
- `printer-picker.tsx` — filters (works with iPad alone, connection, label
  width), sort, and cards with an `InfoButton` on every badge. The default
  sort and the "Recommended" badge come from `compareRecommended` and
  `isRecommended` in the catalog: printers that work with an iPad alone and
  cost nothing more first (cheapest first), 4G printers second, Bluetooth
  last. Each card has a "Monthly cost" row with its own `InfoButton`.
- `printer-picker.dom.test.tsx` — filtering, sorting and the Bluetooth
  warning.

## Parent

[printers](../README.md)
