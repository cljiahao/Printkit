# components

## Purpose

Shared React components — not scoped to one dashboard sub-route. One
subfolder groups a larger cluster (`ui/` shadcn primitives); everything
else sits flat here.

## Contents

- `back-button.tsx` — `BackButton({ href, label })`: a shadcn
  `Button asChild variant="ghost"` + `ArrowLeft` "leave this page" link.
  Used in place of a plain underlined `<Link>` so the back-to-dashboard nav
  is a real hit target with hover/focus state.
- `bridge-status.tsx` — `BridgeStatus({ vendorId, locationId, label })`:
  read-only online/offline pill for a location's bridge device, subscribed
  to a Supabase Realtime Presence channel
  (`printkit:presence:{vendorId}:{locationId}`), labeled with `label` so a
  vendor with multiple locations can tell them apart. The bridge device is
  the publisher.
- `elevated-card.tsx` — `ElevatedCard({ as, className, children })`: the
  shared raised-card container (rounded, bordered, soft shadow) used by the
  login page and the root error boundary, matching every other kit's
  login page.
- `wordmark.tsx` — `Wordmark({ className })`: the "PrintKit" brand mark
  (mint-green "Print" + plain "Kit"). Used by `src/app/error.tsx` and
  `src/app/login/page.tsx`.

## Connectivity

`BackButton` is not yet wired to any dashboard route — the dashboard now has
real content (see `src/app/dashboard/README.md`) but none of its routes need
a "back" link yet. `elevated-card.tsx` is used by `login/page.tsx` and
`src/app/error.tsx`. `wordmark.tsx` is used by `src/app/error.tsx` and
`src/app/login/page.tsx` (not by `src/app/page.tsx`, which is a bare
placeholder). `bridge-status.tsx` is used by `src/app/dashboard/page.tsx`.
`ui/` is used throughout `src/app/` and `src/components/`.

## Parent

[printkit](../../README.md)
