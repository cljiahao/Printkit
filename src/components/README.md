# components

## Purpose

Shared React components — not scoped to one dashboard sub-route. One
subfolder groups a larger cluster (`ui/` shadcn primitives); everything
else sits flat here.

## Contents

- `printer-status-row.tsx` — `PrinterStatusRow({ label, printerName, state,
lastSeenAt })`: one booth's printer and whether it is reachable. It renders
  what the server already read from `printers.last_seen_at`, the health
  signal every connector shares, so no page needs a live subscription and a
  cloud printer, a 4G printer and a Bluetooth bridge all report the same
  way. It replaced a presence-channel component that only a Bluetooth
  bridge could ever feed.
- `info-button.tsx` — `InfoButton({ topic })`: the small "i" next to a badge
  or filter, opening that topic's plain-language explanation from
  `@/lib/printer-info-copy`. It composes shared InfoTooltip with a 24px trigger and opens on tap rather than hover, because
  vendors read these on an iPad where a hover tooltip never appears, and the
  trigger is a real button so it is reachable by keyboard.
- `elevated-card.tsx` — `ElevatedCard({ as, className, children })`: the
  shared raised-card container (rounded, bordered, soft shadow) used by the
  login page and the root error boundary, matching every other kit's
  login page.
- `wordmark.tsx` — `Wordmark({ className })`: the "PrintKit" brand mark
  (mint-green "Print" + plain "Kit"). Used by the dashboard navigation, reset-password page, Bluetooth guide, `src/app/error.tsx` and
  `src/app/login/page.tsx`.

## Connectivity

`elevated-card.tsx` is used by `login/page.tsx` and
`src/app/error.tsx`. `wordmark.tsx` is used by `src/app/error.tsx` and
`src/app/login/page.tsx` (not by `src/app/page.tsx`, which redirects to `/dashboard`). `printer-status-row.tsx` is used by overview and printers pages; offline timestamps are displayed in the Singapore timezone.
`ui/` is used throughout `src/app/` and `src/components/`.

## Parent

[printkit](../../README.md)
