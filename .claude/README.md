# .claude

## Purpose

Claude Code harness for paykit: hook scripts that enforce guardrails at
tool-call/session boundaries, project skills, the harness integrity manifest,
and its verifier.

## Contents

- `harness.json` — harness manifest: templateCentral version/stack/adaptation metadata, plus `seeded_files` — the enforcement-layer file list (path + sha256 `origin_hash`) that `verify-harness.sh` diffs against
- `.harness-base/` — as-seeded mirror of every enforcement-layer file (hooks, `settings.json`, husky, `.gitleaks.toml`, `ci.yml`, the verifier scripts, project skills), used as the 3-way-merge base when a future templateCentral re-sync needs to combine upstream changes with this repo's own edits without clobbering either. Deliberately excludes `AGENTS.md` — it's genuinely customized for this repo's Supabase stack with no legitimate seeded baseline to snapshot.
- `comment-hygiene-patterns.txt` — the shared change-narration/oversized-comment pattern list read at runtime by `hooks/post-edit-comment-check.sh`, `.husky/lib/comment-hygiene.sh`, and the `comment-hygiene` CI job — one canonical copy instead of three
- `hooks/` — the lifecycle scripts `settings.json` wires up (see `hooks/README.md`)
- `regen-harness.sh` — human-run-only: rewrites every `origin_hash` in `harness.json` to match current on-disk content, blessing an intentional harness edit; `protect-files.sh` requires human approval before an agent can even edit it
- `settings.json` — wires each script in `hooks/` to a Claude Code lifecycle event (PreToolUse, PostToolUse, PostToolUseFailure, Stop, SubagentStop, SessionStart, UserPromptSubmit) and sets tool `permissions` (allow/deny/ask) and skill overrides. Hook commands are shell-form (`"command": "bash .claude/hooks/x.sh"`, no `args`) rather than exec-form (`"command": "bash", "args": [...]`) — exec-form does a raw PATH lookup for `bash`, which on Windows can resolve to the System32 WSL launcher stub ahead of Git Bash and fail if no WSL distro is installed.
- `skills/` — project skills (`next-verify`, `supabase-migrate`)
- `verify-harness.sh` — harness integrity sensor: recomputes sha256 for every seeded file matched by a path guard and compares to `harness.json`'s `origin_hash` baseline; read-only, exits non-zero on drift; run by CI and husky's `pre-push` hook

## Connectivity

`settings.json` is the wiring diagram: it maps each Claude Code lifecycle
event to a script in `hooks/`, so a hook script does nothing until
`settings.json` references it. `harness.json`'s `seeded_files` list is the
source of truth for which of those hook scripts (plus `settings.json`
itself, the husky/gitleaks/CI config) count as "enforcement layer" —
`verify-harness.sh` hashes each listed path and fails if it drifts from the
recorded `origin_hash`.

## Parent

[paykit](../README.md)
