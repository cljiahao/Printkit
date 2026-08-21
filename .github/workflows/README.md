# workflows

## Purpose

GitHub Actions CI pipelines: `ci.yml` (harness integrity, check, unit tests,
coverage gate, build, mutation, db migrations + RLS, changelog gate,
README-freshness gate, comment-hygiene gate) and `security.yml` (gitleaks
secret scan, dependency audit).

## Contents

- `ci.yml` — triggers on push to `main` and on every PR. Jobs: `test`
  ("check + unit" — harness-integrity check, `pnpm check`, `pnpm test`, then
  a changed-line coverage gate via `diff-cover` against `origin/main`,
  failing under 80%); `db` ("db (migrations + pgTAP RLS)"); `build` ("build
  (next build)" — `pnpm build` with dummy Supabase env vars); `mutation`
  ("mutation (changed lib)" — Stryker against changed `src/lib` files);
  `changelog` (PR-only — if `src/` changed, `CHANGELOG.md` must also be in
  the PR diff; skippable via `skip-changelog`); `readme-freshness` (PR-only
  — if a folder's files changed, that folder's `README.md` must also be in
  the PR diff; skippable via `skip-readme-check`); `comment-hygiene`
  (PR-only — hard-fails on change-narration comments in _added_ lines only,
  via the keyword patterns in `.claude/comment-hygiene-patterns.txt`;
  skippable via `skip-comment-check`).
- `security.yml` — gitleaks secret scan + `pnpm audit`, triggered on push to
  `main`, every PR, and a weekly cron.

## Connectivity

`ci.yml`'s `test` job depends on `.claude/verify-harness.sh` and
`.claude/harness.json` (see `.claude/README.md`) staying in sync.
`security.yml` is what husky's `pre-commit` gitleaks step mirrors locally.

## Parent

[.github](../README.md)
