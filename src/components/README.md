# components

## Purpose

Shared React components — not scoped to one dashboard sub-route (those live
under `src/app/dashboard/<route>/`). Two subfolders group larger clusters
(`landing/` marketing sections, `ui/` shadcn primitives); everything else
sits flat here.

## Contents

- `back-button.tsx` — `BackButton({ href, label })`: a shadcn
  `Button asChild variant="ghost"` + `ArrowLeft` "leave this page" link,
  ported from qkit. Used in place of a plain underlined `<Link>` so the
  back-to-dashboard nav is a real hit target with hover/focus state.
- `elevated-card.tsx` — `ElevatedCard({ as, className, children })`: the
  shared raised-card container (rounded, bordered, soft shadow) used by the
  login page, matching every other kit's login page.
- `social-icons.tsx` — `SOCIAL_LINK_FIELDS`: the website/Instagram/
  Facebook/TikTok field list (plain lucide glyphs, not brand-mark icons).
- `social-links-fields.tsx` — the input-field group rendering
  `SOCIAL_LINK_FIELDS` for the profile settings page.

`FeedbackForm`/`SupportForm`/`ImageUploader`/`InfoTooltip`/`Section` were
migrated onto `@merqo/ui`'s shared versions (2026-08-05 `@merqo/ui`
migration) and deleted from here — `FeedbackForm`/`SupportForm` had zero
call sites outside `dashboard-nav.tsx` and fully absorbed into `@merqo/ui`'s
`AccountMenu`; `ImageUploader`/`InfoTooltip`/`Section` are now imported
directly from `@merqo/ui` at their call sites (`src/app/dashboard/
profile/profile-form.tsx`, `src/app/dashboard/config/payment-config-form.tsx`).
paykit's own upload glue (resize + Supabase Storage write) lives in
`@/lib/image-upload-adapter.ts` now, wired through `@merqo/ui`'s
`ImageUploader`'s `onUpload`/`resizeImage` props.

## Connectivity

`social-links-fields.tsx` is
used by the dashboard profile settings page. `BackButton` is used by the
dashboard `profile/` and `plan/` pages. `landing/` is only used by
`src/app/page.tsx`. `ui/` is used everywhere. `@merqo/ui`'s `AccountMenu`
(rendered from `dashboard-nav.tsx`) owns the Feedback/Get-help `Sheet`
drawers, wired to `submitFeedbackAction`/`submitSupportMessageAction` in
`src/app/actions/`.

## Parent

[paykit](../../README.md)
