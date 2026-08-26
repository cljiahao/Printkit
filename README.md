# printkit

Hardware print connector for Merqo vendors. v0.1 ships label printing via
the NIIMBOT B1; architecture is job-type-agnostic for later job types
(receipt, kitchen-ticket, shelf-label, invoice). Internal-only — reached
through a vendor's existing sibling-kit relationship (qkit today), no
public marketing site or pricing; `/` redirects straight to `/dashboard`.
`POST /api/v1/print-jobs` accepts an optional `job_type` field (the DB
still only allows `'label'` for now) so the API shape isn't hardcoded to
today's one job type ahead of that widening. The outbound print-status
callback is kit-agnostic too — configured per calling kit in
`kit_api_keys` (`callback_url`/`callback_secret`), not hardcoded to qkit.
The bridge's own print dispatch is job-type-keyed too
(`src/lib/print-job-renderers.ts`), one renderer today. Printer-model
config (`src/lib/niimbot-model.ts`) is likewise a lookup, not a hardcode —
`niimbluelib` already supports other NIIMBOT models, one is configured
today.

See `AGENTS.md` for the full stack, commands, and data model. A vendor can
pair a separate physical bridge/printer to each of their booths, not just
one shared bridge per vendor — see `print_locations` in `AGENTS.md`'s
data model section. The bridge page also accepts a `?booth=<id>` deep link
(matched against a location's `source_ref`) so a calling kit — qkit's booth
settings today — can send a vendor straight to one booth's pairing panel;
see `src/app/dashboard/bridge/README.md`.

Design: `docs/superpowers/specs/2026-08-21-printkit-v0.1-design.md`,
`docs/superpowers/specs/2026-08-23-printkit-location-routing-design.md`

Shared dashboard nav/account menu, and now `JobStatusBadge`'s shared
`StatusBadge` shape, come from `@merqo/ui`
(`github:cljiahao/merqo-ui#v0.22.1`, `package.json`).

Brand theme is "Banknote Engrave" (engraved teal-green primary, warm-grey
secondary) — see `src/app/globals.css`'s own header comment.
