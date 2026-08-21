# ui

## Purpose

shadcn/ui (new-york style) primitives, installed via
`pnpm dlx shadcn@latest add <component> --yes` and left close to generated —
don't hand-edit structurally, re-run the generator instead so upstream fixes
aren't lost. Wrapped by feature components elsewhere in `src/components/`
and `src/app/`; nothing here is paykit-specific.

## Contents

`avatar`, `badge`, `button`, `dialog`, `dropdown-menu`, `input`, `label`,
`radio-group`, `sheet`, `skeleton`, `table`, `textarea`, `toggle`,
`toggle-group`, `tooltip` — one file per primitive, named to match. `sheet`
backs the Feedback/Get-help drawers off the account menu; `radio-group`
backs the payment-config kind picker; `toggle-group` backs the
support-form category picker; `dropdown-menu` backs the account menu
itself; `skeleton` backs the dashboard's `loading.tsx` fallback.

## Connectivity

Imported directly by name (`@/components/ui/<name>`) from feature
components throughout `src/components/` and `src/app/`.

## Parent

[components](../README.md)
