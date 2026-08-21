<!-- templateCentral: nextjs (Supabase variant — shared project, schema per kit) -->

# AGENTS.md — printkit

> STOP — This project diverges from the stock templateCentral Next.js stack on
> the data layer only. Auth/DB/realtime are **Supabase** (`@supabase/ssr`), not
> better-auth + Drizzle. Authorization is enforced in Postgres via **RLS**, not
> an app repository layer. Runtime matches tc: Next 16, route protection in
> `src/proxy.ts`, and `cookies()`/`headers()`/`params`/`searchParams` are async.

## What printkit is

Hardware print connector for Merqo vendors — job-type-agnostic architecture,
v0.1 ships one job type (label, via the NIIMBOT B1). Owns the `printkit`
schema in the shared Supabase project. qkit calls printkit's bearer-secret
`POST /api/v1/print-jobs` on order-placed; printkit calls back into qkit on
job status change. Full design: `docs/superpowers/specs/2026-08-21-printkit-
v0.1-design.md`.

## Stack

Next.js 16 · App Router · Turbopack · TypeScript strict · Tailwind v4 · shadcn/ui
(new-york) · Zod · Supabase (`@supabase/ssr`) · Vitest · pnpm 11 · Node ≥24 ·
deploy target: Vercel

## Commands

```bash
pnpm dev          # dev server — http://localhost:3000
pnpm build        # production build
pnpm test         # run test suite (vitest)
pnpm test:mutation # stryker mutation testing (scoped to src/lib; advisory)
pnpm check        # prettier --check + eslint + tsc --noEmit
pnpm format       # prettier --write
```

## File Layout

```
src/app/                          — app router (dashboard, login, API routes)
src/proxy.ts                      — Supabase session refresh + /dashboard guard (Next 16)
src/lib/supabase/                 — browser / server / service clients (schema=printkit)
src/lib/kit-auth.ts               — bearer-secret verification for calling kits
src/lib/vendor-session.ts         — shared dashboard auth guard (getVendorSession)
src/lib/types.ts                  — DB types (mirror of supabase/migrations)
scripts/create-kit-key.mjs        — mint + store a hashed bearer secret for a calling kit
supabase/migrations/              — SQL schema + RLS + grants
supabase/tests/rls.test.sql       — pgTAP RLS suite
```

## Data model

- `print_jobs`: core table, also the vendor-facing job/transaction history.
  `job_type` (`'label'` only in v0.1, column designed to hold future types),
  `status` (`queued`→`sent`→`printed`|`failed`), `source_kit`/`source_ref`
  identify the calling kit's order. RLS: vendor reads (not writes) only their
  own rows; writes are service-role + bearer-secret, server-only.
- `kit_api_keys`: one hashed bearer secret per calling kit, service-role only.
- `admins`/`is_admin(uid)`/`admin_audit`: internal platform-operator
  allow-list + immutable audit trail (service-role insert/select only, no
  update/delete grant ever issued, RLS admin-read-only). Logs bridge
  connected/disconnected, printer paired, manual reprint triggered, qkit
  link connected/disconnected, print-job config changed.

## Rules (always)

- TypeScript strict — no `any`, no `@ts-ignore`.
- Validate all user input with Zod at every boundary.
- Authorization lives in **RLS policies**, not in app code.
- Use the **service-role client only** in Server Actions / Route Handlers, never
  in client components.
- No secrets in `NEXT_PUBLIC_*`.
- `@supabase/ssr` and `@supabase/supabase-js` versions must stay compatible.
- Every `/api/v1/*` route verifies the caller's bearer secret via
  `verifyKitAuth` before touching the database.
- No shared code library for print/Bluetooth logic — printkit-only, never
  imported by another kit.
- After editing the schema, update both `supabase/migrations/` and
  `src/lib/types.ts`.

## Skills

### Project skills — check here first (`.claude/skills/`)

| Skill               | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `/next-verify`      | typecheck + lint + test in one pass                          |
| `/supabase-migrate` | apply `supabase/migrations` + regenerate types (safety gate) |

### templateCentral plugin skills

templateCentral has **no Supabase support** (auth=better-auth, db=Drizzle/Kysely/Mongoose,
no realtime). Use only the stack-agnostic ones here:

| Skill                       | When to use                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| `templatecentral:standards` | naming/validation/drift-check (expect Supabase-vs-tc drift findings) |

Do **not** run `templatecentral:add (auth)` or `(database)` — they install
better-auth / Drizzle and will break RLS.

## AI Harness

PreToolUse: blocks secret files (exit 2): `.env*` (except `.env.example`),
cert files (`.pem`/`.key`/`.p12`/`.pfx`/`.secret`), `credentials.json`/`.netrc`/`.secrets`;
and blocks `--no-verify`. App code, skills, specs, and `.github/workflows/`
unrestricted.
UserPromptSubmit: pattern-checks prompts for injection phrases; exit 2 blocks.
PostToolUse: `tsc --noEmit --incremental` after every Edit/Write, plus a
comment-hygiene scan (`post-edit-comment-check.sh`) flagging change-narration
comments (`was`/`added`/dated/ticket-ref-shaped openers, per
`.claude/comment-hygiene-patterns.txt`) and oversized comment blocks on the
edited file. Both feedback-only, never block.
Stop: exits 0 when `stop_hook_active` (no re-entry loop); else runs the test
suite, exit 2 feeds failures back, exit 0 on pass.
SessionStart (startup|resume|compact): re-injects first 30 lines of this file.
`permissions`: max-privilege — bare-tool `allow` (Bash/Read/Edit/Write/web/Skill/
Task) so common work doesn't prompt; `deny` covers secret reads/edits (`.env.local`
and other `.env.<env>` variants, `./secrets/**` — `.env.example` is the one
whitelisted env file) and irreversible ops (`rm -rf`, `git push --force`/`-f`,
`git reset --hard`, `git clean -fd/-fx`, `git filter-branch`, ref-delete). `ask`
gates `Edit(...)` (covers both Edit and Write) on the medium-security governance
files: `AGENTS.md`, `CLAUDE.md`, `docs/CONSTITUTION.md`, `.claude/harness.json`,
`.claude/settings.json`, `.claude/settings.local.json`. Deny always wins (enforced
even under bypass); it's a guardrail, not a sandbox.
Git hooks (husky): pre-commit runs format/lint/typecheck, a
`--frozen-lockfile` install gated on `package.json` changes
(lockfile-in-sync — also re-checked in CI), gitleaks secret-scan on staged
files, a readme-coupling staleness warning, and a comment-hygiene warning
(same pattern list as the PostToolUse hook, both warn-only); commit-msg enforces
Conventional Commits; pre-push runs the harness integrity check + quality
gate. Hard-local; coverage/changed-line gates run in CI. Migrated
2026-08-01 off lefthook, whose unsigned `lefthook.exe` Windows Smart App
Control blocks unconditionally — see
`docs/superpowers/specs/2026-08-01-lefthook-to-husky-migration-design.md`.
CI (GitHub Actions): `test` (check + unit + coverage) with a hard gate on
changed-line coverage (`diff-cover` ≥80%), `build` (`next build` — the one
job that catches Next.js client/server bundle-boundary errors `pnpm
check`/`pnpm test` miss), existing `db` (pgTAP RLS) and `mutation`
(Stryker, advisory) jobs, a lockfile-in-sync re-check, a changelog-touched
check, a readme-freshness check, a comment-hygiene check (hard gate, scoped
to added lines only, against the first 10 lines of
`.claude/comment-hygiene-patterns.txt` — the narration-keyword patterns, not
the lower-precision date/ticket-ref ones; `skip-comment-check` label
bypasses), harness integrity, and (via `security.yml`) a full-history
gitleaks scan + `pnpm audit` + CodeQL.
RLS isolation: `supabase/tests/rls.test.sql` via `supabase test db`.
Project skills (directory form, `<name>/SKILL.md`): `.claude/skills/` |
Manifest: `.claude/harness.json`. Fully armed: every `.claude/harness.json`
entry carries a real sha256 as of the 2026-08-01 husky migration's
`regen-harness.sh` run.

## Skills Security

- Review `SKILL.md` before installing any third-party skill — treat skills like packages.
- Scope `allowed-tools:` to the minimum (e.g. `Bash(git *)` not `Bash`).
- Never install skills that hardcode secrets or make unlisted outbound calls.

## Project-Specific Notes

- This repo is a fresh harness seeded from the sibling project `paykit`
  (same templateCentral-adjacent Supabase variant, same shared Supabase
  project, different schema) — same seeding precedent paykit itself used
  from qkit.
- Design: `docs/superpowers/specs/2026-08-21-printkit-v0.1-design.md`. Plan
  of record (this file's task set): `docs/superpowers/plans/2026-08-21-
printkit-v0.1-plan1-scaffold-data-model.md`.

<!-- [[post-harness]] — reserved for trace capture and meta-harness integration -->
