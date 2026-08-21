# .husky/lib

## Purpose

The real script bodies for husky's `pre-commit`/`commit-msg`/`pre-push`
hooks. Kept as separate real-bash files, invoked via `exec bash
.husky/lib/<name> "$@"` from the thin top-level hook files, because husky
v9's dispatcher runs those top-level files through POSIX `sh -e`, which
ignores their `#!/usr/bin/env bash` shebang and doesn't support
`set -o pipefail`.

## Contents

- `pre-commit.sh` — format/lint (`prettier`+`eslint --fix` on staged
  `.ts/.tsx/.js/.mjs/.cjs`, piped through `tr '\n' '\0' | xargs -0` so
  filenames with spaces/quotes are handled correctly — portable across GNU
  and BSD xargs, unlike `xargs -d '\n'`), `tsc --noEmit`, a frozen-lockfile
  install check when `package.json` is staged, a gitleaks secret-scan on
  staged files (if gitleaks is installed), then `readme-coupling.sh` and
  `comment-hygiene.sh`.
- `pre-push.sh` — runs `../../.claude/verify-harness.sh` (integrity check)
  plus `pnpm run check && pnpm test`.
- `readme-coupling.sh` — pre-commit nudge (non-blocking): warns to stderr
  when staged files touch a folder whose `README.md` wasn't also staged;
  the commit still proceeds.
- `comment-hygiene.sh` — pre-commit nudge (non-blocking): warns to stderr
  when a staged file has a change-narration comment or an oversized
  comment block, per `.claude/comment-hygiene-patterns.txt`; the commit
  still proceeds. Same pattern list the live `PostToolUse` hook
  (`.claude/hooks/post-edit-comment-check.sh`) and the CI
  `comment-hygiene` job read.
- `commit-msg-check.sh` — Conventional Commits gate: validates the commit
  message's first line against
  `^(feat|fix|chore|docs|style|refactor|test|ci|perf|build|revert)(\(scope\))?: description`,
  exempting merge commits and `chore(release):`; non-zero exit rejects the
  commit.

## Connectivity

Invoked exclusively by the three top-level `.husky/*` hook files — see
[../README.md](../README.md) for how those wire into git via
`core.hooksPath`. Every file here is part of the integrity-checked
enforcement layer recorded in `.claude/harness.json`.

## Parent

[.husky](../README.md)
