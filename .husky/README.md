# .husky

## Purpose

The git-hook layer (husky v9 — no native binary, so nothing for Windows
Smart App Control to block, unlike lefthook's unsigned `lefthook.exe`).
`pnpm install`'s `prepare` script runs `husky`, which points
`core.hooksPath` at this directory.

## Contents

- `pre-commit` — thin wrapper: `exec bash .husky/lib/pre-commit.sh "$@"`.
- `commit-msg` — thin wrapper: `exec bash .husky/lib/commit-msg-check.sh "$1"`.
- `pre-push` — thin wrapper: `exec bash .husky/lib/pre-push.sh "$@"`.
- `lib/` — the real script bodies, all plain bash (`set -euo pipefail`) run
  via `exec bash`, not husky's `sh -e` dispatcher (see Connectivity):
  - `pre-commit.sh` — runs format/lint (`prettier`+`eslint --fix` on staged
    `.ts/.tsx/.js/.mjs/.cjs`, piped through `xargs -d '\n'` so filenames with
    spaces/quotes survive), `tsc --noEmit`, a frozen-lockfile install check
    when `package.json` is staged, a gitleaks secret-scan on staged files
    (if gitleaks is installed), then the README-coupling nudge and the
    comment-hygiene nudge.
  - `pre-push.sh` — runs `.claude/verify-harness.sh` (integrity check) plus
    `pnpm run check && pnpm test`.
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

Husky invokes `pre-commit`/`commit-msg`/`pre-push` directly by name — no
central config file (unlike lefthook's `lefthook.yml`). Its v9 dispatcher
runs each of these three files via `sh -e "$s"` — literally POSIX `sh`,
ignoring the `#!/usr/bin/env bash` shebang — so all three are kept as thin
`exec bash .husky/lib/<name>` wrappers rather than doing the real work
inline: the moment the logic needs bash-only behavior (`set -o pipefail`
isn't POSIX), it has to hand off to a real bash invocation first. `commit-msg`
passes husky's message-file path straight through as `$1`, a plain argv
element; this is why the Windows-path-with-space argv-rejoin wrapper
`.lefthook/commit-msg/commit-msg.sh` used to need (lefthook's `{1}` template
substitution mis-quoted when the checkout path itself contains a space, as
this repo's does — "Merqo Business") is gone, not ported. `pre-push`
separately runs `.claude/verify-harness.sh` and the full
`pnpm run check && pnpm test` gate. `.claude/verify-harness.sh` treats every
file in this folder as part of the integrity-checked enforcement layer
recorded in `.claude/harness.json`.

## Parent

[paykit](../README.md)
