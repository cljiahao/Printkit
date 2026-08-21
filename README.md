# paykit

The Merqo family's shared payment engine. A vendor sets up their payment
method once here — a generated PayNow QR, or their own BYO payment
link/QR image — and any Merqo kit can then request a checkout + track
payment status for that vendor over paykit's HTTP API. paykit never
touches funds — it renders the checkout the customer pays through in
their own bank/payment app, and a human confirms receipt. A calling kit
without its own vendor-session UI can also write the config directly via
`POST /api/v1/vendors/{vendor_id}/config` (bearer-secret authenticated,
same schema the dashboard's own config form uses) — see
`src/app/api/v1/vendors/[vendor_id]/config/README.md`. A vendor setting up
their own BYO payment link/QR picks from a four-card preset directory
(Stripe Payment Link, HitPay Payment Link, PayLah! QR, or Other/Custom —
`src/app/dashboard/config/pointer-presets.ts`) that shows tailored
"where to find this" instructions and, for Stripe/HitPay, a soft warning
if the pasted link doesn't look right; it's UI/copy only, no PSP
integration and no new database column. Display font is
Fraunces (`src/app/layout.tsx`), the shared family face every Merqo kit
now uses — see `docs/business/2026-08-13-typography-family-standard.md`
in the workspace root for why. Brand theme is "Banknote Engrave"
(engraved teal-green primary, steel-blue secondary) as of 2026-08-19 —
see `globals.css`'s own header comment; `src/lib/brand-icon.tsx`'s
ImageResponse-generated favicon/apple-touch-icon carries the same rebrand.

`admin_audit`'s coverage now extends past the `/admin` console: a vendor's
own refund (`issueRefundAction`) is recorded too, and the table is
append-only at the grant level (`service_role` can no longer `UPDATE`/
`DELETE` it, only `SELECT`/`INSERT`) — see `src/app/admin/README.md` and
`AGENTS.md`'s data model section for the retention policy.

In production, the Supabase auth cookie is scoped to `.merqo.io`
(`NEXT_PUBLIC_AUTH_COOKIE_DOMAIN`, `src/lib/supabase/`), so signing in on
one Merqo kit signs you in on the rest. The dashboard's onboarding tour
(`src/components/dashboard-tour.tsx`) stamps its "seen" state as soon as
it auto-runs rather than when it finishes, so a refresh mid-tour can't
make it re-trigger on the next load — and since that client-fired stamp
is fire-and-forget and could be aborted by a hard navigation (the tour's
own steps spotlight a nav link), `/dashboard`'s own server render
(`src/app/dashboard/page.tsx`) also stamps it synchronously, durably, as
part of the request, as defense-in-depth. The tour's first step now shows
an example transaction preview, and its copy no longer uses em dashes.
`@merqo/ui`'s `DashboardNav`
(v0.10.0+) is now wired with `LinkComponent={Link}`
(`src/app/dashboard/dashboard-nav.tsx`), so its nav links do a
client-side transition rather than a full page reload in the first
place. `POST /api/v1/checkout` is idempotent
on `(kit_slug, order_ref)` — a retried call returns the existing
transaction instead of creating a duplicate. Checkout creation itself
goes through a pluggable `PaymentProvider` seam
(`src/lib/payments/provider.ts`) — today's only registered provider is
`direct`, wrapping the existing PayNow/pointer builder unchanged, so a
future real gateway is a `PAYKIT_PROVIDER` config value plus one new
provider implementation, not a route rewrite. `pnpm-workspace.yaml`'s
`overrides` pins several transitive dependencies (`postcss`, `undici`,
`vite`, `qs`, `sharp`, `nanoid`, `fast-uri`, `js-yaml`, `brace-expansion`)
past known-vulnerable versions Next.js itself and dev tooling still
bundle; `pnpm audit --prod --audit-level=high` is CI's hard gate — bump
the relevant floor here when a new advisory lands, and re-check after any
`next` upgrade in case it's safe to drop one. `next`/`eslint-config-next`
are pinned exact at `16.2.12` (not `^16.2.12`) — `16.3.1`'s Turbopack build
stops emitting `.next/next-server.js.nft.json`, which breaks every Vercel
deploy; revisit the pin once that's fixed upstream. The dashboard nav, account
menu, profile-page layout, image upload, onboarding tour, and landing nav
now delegate to the shared `@merqo/ui` package (v0.18.0, `package.json`;
kit-family consistency;
paykit keeps its own wordmark, nav links, tier badge, and feedback/support
wiring as thin adapters over the shared components). The dashboard nav's
account menu also passes `switchKits` via `@merqo/ui`'s `getSwitchKits("paykit")`
helper (qkit/loopkit/stockkit, resolved to their real `<kit>.merqo.io`
domains as of v0.14.1 — v0.14.0 had pointed at each kit's `-sg.vercel.app`
deployment host instead, a different domain from the shared-session
cookie's `.merqo.io` scope) so a signed-in vendor can jump to another
kit's dashboard via the shared SSO cookie — see `src/app/dashboard/README.md`. The admin console's
Pricing section wraps `@merqo/ui`'s `PricingForm` (paykit's first real
adopter of that component). Every `/dashboard`
route shares one layout-level content-width container (`mx-auto w-full
max-w-7xl` in `src/app/dashboard/layout.tsx`, matching qkit's canonical
dashboard width) instead of each page setting its own, inconsistent width
— pages needing a narrower reading width (forms, short card stacks) nest
an inner `mx-auto max-w-*` div inside it. Dark mode (`globals.css`'s
`.dark` block) is now actually reachable: `src/app/layout.tsx` wraps the
app in `next-themes`' `ThemeProvider`, which `@merqo/ui`'s always-on
account-menu Light/Dark/System control drives. See `CHANGELOG.md` for the
latest changes.

Sign-in (`/login`) supports email+password (with a "Check your email"
confirmation state and a real forgot-password flow) and Google OAuth. Once
signed in, a Free-tier vendor can file a real, one-click Pro-upgrade request
from the dashboard's Plan page — no payment provider involved; Pro is
granted manually, via a Merqo-team-only admin console (`/admin`, gated by
an `admins` allow-list) with platform-wide stats, a per-vendor plan
toggle, and a live Pro-price editor (`paykit.pricing`, `@merqo/ui`'s
`PricingForm`) — the Pro price (seeded at $4.99/mo) can be changed with no
redeploy, and every page that quotes it (plan page, dashboard nudge,
landing copy) reads it live instead of a hardcoded string. Pro's one
remaining gate is refund tracking; revenue stats are free for every
vendor. `/api/merqo/vendor-status` (merqo hub's own vendor-active/plan
lookup) paginates the Supabase admin-users API properly, via the same
`listAllUsers` helper the admin console uses — it no longer silently
truncates at the first 1000 auth users. The landing footer matches qkit's exactly (single-row
wordmark/tagline/copyright/sign-in link, no CTA band above it), and the
landing page's `BackToTop` button matches the cross-kit landing-page
parity pass.

Event-cart vendors (weddings, private events) can now take a deposit now
and bill the balance closer to the event instead of one-shot checkout —
`/dashboard/bookings` (`src/app/dashboard/bookings/README.md`). A booking
links up to two `transactions` rows (deposit, then later balance) by id;
a Postgres trigger (`sync_booking_status()`,
`supabase/migrations/0010_paykit_bookings.sql`) keeps `bookings.status`
correct off those transactions' own `confirmed` state regardless of which
path confirmed them — the dashboard or the bearer-secret
`/api/v1/checkout/{id}/confirm` API another kit's flow calls. Reminders
are a dashboard-only "balance due soon/overdue" badge this round — this
repo has no cron or push-notification infrastructure, so it's computed at
render time (`src/lib/booking-status.ts`), not a push. The checkout-
creation logic `POST /api/v1/checkout` used is now shared, via
`src/lib/checkout.ts`, with the booking actions that create a deposit/
balance checkout directly from the dashboard instead of round-tripping
through HTTP.

See `AGENTS.md` for stack, commands, data model, rules, and the AI
harness/CI setup (templateCentral-based); `CHANGELOG.md`
for what's shipped since the MVP, including the "Name | Tagline" Title Case
browser-tab title convention shared across every Merqo kit. Folder-level `README.md`s (`src/lib/`,
`src/components/`, and their subfolders) cover what each module does and
how it's wired together. See
`docs/superpowers/specs/2026-07-15-paykit-mvp-design.md` for the original
approved design and `docs/superpowers/plans/2026-07-15-paykit-mvp.md` for
its implementation plan — later work has its own dated specs/plans under
the same `docs/superpowers/` folders.
