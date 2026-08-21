# components

## Purpose

Shared React components — not scoped to one dashboard sub-route. Two
subfolders group larger clusters (`landing/` marketing sections, `ui/`
shadcn primitives); everything else sits flat here.

## Contents

- `back-button.tsx` — `BackButton({ href, label })`: a shadcn
  `Button asChild variant="ghost"` + `ArrowLeft` "leave this page" link.
  Used in place of a plain underlined `<Link>` so the back-to-dashboard nav
  is a real hit target with hover/focus state.
- `elevated-card.tsx` — `ElevatedCard({ as, className, children })`: the
  shared raised-card container (rounded, bordered, soft shadow) used by the
  login page and the root error boundary, matching every other kit's
  login page.

## Connectivity

`BackButton` is not yet wired to any dashboard route (the dashboard is
currently a single placeholder page — see `src/app/README.md`).
`elevated-card.tsx` is used by `login/page.tsx` and `src/app/error.tsx`.
`landing/` is only used by `src/app/page.tsx`. `ui/` is used throughout
`src/app/` and `src/components/`.

## Parent

[printkit](../../README.md)
