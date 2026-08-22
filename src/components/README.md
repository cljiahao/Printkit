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
- `elevated-card.tsx` — `ElevatedCard({ as, className, children })`: the
  shared raised-card container (rounded, bordered, soft shadow) used by the
  login page and the root error boundary, matching every other kit's
  login page.
- `wordmark.tsx` — `Wordmark({ className })`: the "PrintKit" brand mark
  (mint-green "Print" + plain "Kit"). Used by `src/app/error.tsx` and
  `src/app/login/page.tsx`.
- `bridge-status.tsx` — read-only online/offline pill for the vendor's
  bridge device, subscribed to a Supabase Realtime Presence channel
  (`printkit:presence:{vendorId}`). Plan 4's bridge device is the publisher.

## Connectivity

`BackButton` is not yet wired to any dashboard route (the dashboard is
currently a single placeholder page — see `src/app/README.md`).
`elevated-card.tsx` is used by `login/page.tsx` and `src/app/error.tsx`.
`wordmark.tsx` is used by `src/app/error.tsx` and `src/app/login/page.tsx`
(not by `src/app/page.tsx`, which is a bare placeholder). `bridge-status.tsx`
is not yet wired to any page (will be consumed by Task 8's overview page).
`ui/` is used throughout `src/app/` and `src/components/`.

## Parent

[printkit](../../README.md)
