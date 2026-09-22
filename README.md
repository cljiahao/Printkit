# printkit

Hardware print connector for Merqo vendors. Prints a label for every
order, through one of three connectors (`src/lib/connectors/`):
`cloud_poll` for printers that fetch their own jobs (Star CloudPRNT),
`vendor_cloud` for printers reached through their maker's cloud (Feie 4G),
and `bridge` for Bluetooth printers (NIIMBOT B1) through an Android phone in
Bridge mode or the Raspberry Pi agent in `bridge-agent/`. Supported models
live in a static catalog (`src/lib/printer-catalog.ts`), which also holds
the recommendation order: iPad-alone printers with no monthly cost first
(cheapest first), 4G printers second, Bluetooth last; labels are laid out
once (`src/lib/label-layout.ts`) and rendered per driver, a PNG for most,
Feie's own markup for Feie. Architecture is job-type-agnostic for later job
types (receipt, kitchen-ticket, shelf-label, invoice). Internal-only —
reached through a vendor's existing sibling-kit relationship (qkit today),
no public marketing site or pricing; `/` redirects straight to
`/dashboard`. `POST /api/v1/print-jobs` accepts an optional `job_type`
field (the DB still only allows `'label'` for now). The outbound
print-status callback is kit-agnostic too — configured per calling kit in
`kit_api_keys` (`callback_url`/`callback_secret`), not hardcoded to qkit.
`next.config.ts` keeps `@napi-rs/canvas` (the label rasterizer's native
module) out of the bundle and traces `src/assets/fonts/` into every API
route.

See `AGENTS.md` for the full stack, commands, and data model. A vendor can
pair a separate physical bridge/printer to each of their booths, not just
one shared bridge per vendor — see `print_locations` in `AGENTS.md`'s
data model section. The bridge page also accepts a `?booth=<id>` deep link
(matched against a location's `source_ref`) so a calling kit — qkit's booth
settings today — can send a vendor straight to one booth's pairing panel;
see `src/app/dashboard/bridge/README.md`.

Design: `docs/superpowers/specs/2026-08-21-printkit-v0.1-design.md`,
`docs/superpowers/specs/2026-08-23-printkit-location-routing-design.md`,
`docs/superpowers/specs/2026-09-20-printer-connectors-design.md`

`next` is pinned to `16.3.4` and `vitest` to `4.1.11` (see `CHANGELOG.md`
for the security context). The Vercel build does not use
`output: "standalone"`; that config was dropped.

Shared dashboard nav/account menu, and now `JobStatusBadge`'s shared
`StatusBadge` shape, come from `@merqo/ui`
(`github:cljiahao/merqo-ui#v0.30.0`, `package.json` — bumped 2026-09-15 for
`DashboardTours`, a route-matched multi-tour router for kits with more than
one dashboard-page tour; purely additive, this kit's own `DashboardTour`
usage is unchanged; bumped again 2026-09-16 for per-kit terms-schedule
scoping and the founder's public-name fix, see below). The dashboard shell
also gates a signed-in vendor on a current terms/privacy acceptance
(`/legal/*`, own README) before rendering, redirecting a stale vendor to
`/legal/accept` — see `src/app/legal/README.md`. As of `v0.24.0`,
`TermsAcceptanceCheckbox` no longer collects a typed legal name — just the
agree checkbox.

`/legal/terms` now renders only printkit's own Annex schedule
(`<LegalDocument doc="terms" kit="printkit" />`), not every sibling kit's —
previously every kit's `/legal/terms` page showed the full multi-kit annex
since none passed kit context. `legal/accept/actions.ts`'s recorded
`doc_sha256` hashes that same scoped content.

Brand theme is "Banknote Engrave" (engraved teal-green primary, warm-grey
secondary) — see `src/app/globals.css`'s own header comment.

A vendor can now reprint an already-`printed` label, not just a `failed`
one — see `src/app/dashboard/history/README.md`'s `reprintJob` entry.
