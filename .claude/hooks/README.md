# hooks

## Purpose

The scripts `.claude/settings.json` wires to Claude Code lifecycle events —
the actual guardrail logic (secret/CI protection, commit hygiene, type
feedback, prompt-injection screening, skill-usage logging) behind the
harness.

## Contents

- `block-no-verify.sh` — PreToolUse(Bash): blocks `--no-verify`/`-n` on
  `git commit`, hook-bypass env vars, direct commits to `main`, force-push
  to a protected branch, `git checkout/restore` on guard-layer files, and
  recursive-force `rm` on source directories; exit 2 blocks.
- `post-edit-typecheck.sh` — PostToolUse(Edit|Write), `.ts`/`.tsx` files
  only: runs incremental `tsc --noEmit` and surfaces the last 5 lines;
  feedback-only, never blocks.
- `post-edit-comment-check.sh` — PostToolUse(Edit|Write): flags
  change-narration comments (patterns from `../comment-hygiene-patterns.txt`)
  and oversized comment blocks via `hookSpecificOutput.additionalContext`;
  feedback-only, never blocks.
- `post-tool-failure.sh` — PostToolUseFailure: writes the failed tool's
  name/error to stderr so the model can self-correct; always exits 0.
- `protect-files.sh` — PreToolUse(Edit|Write): hard-blocks (exit 2) writes
  to `.env*` (except `.env.example`), CI/CD pipeline files, secrets
  directories, and cert/credential files; asks for human approval on other
  protected files (`AGENTS.md`/`CLAUDE.md`, `docs/CONSTITUTION.md`,
  `.claude/settings.json`, `.claude/harness.json`, `.claude/settings.local.json`).
- `session-context.sh` — SessionStart(startup|resume|clear|compact):
  re-injects the first 30 lines of `AGENTS.md`.
- `skill-usage-log.sh` — PostToolUse(`Skill__.*`): appends a
  `timestamp\tskill-name` line to `.claude/skill-usage.log`; always exits 0.
- `stop-checks.sh` — Stop: runs `pnpm test`; on failure, tails the last 20
  lines to stderr and exits 2; short-circuits to exit 0 when
  `stop_hook_active` is true, avoiding a re-entry loop.
- `subagent-stop.sh` — SubagentStop: if a subagent left uncommitted
  `.ts`/`.tsx` changes, runs `tsc --noEmit` and exits 2 with the last 20
  lines of errors, blocking a handback of broken code.
- `user-prompt-guard.cjs` — UserPromptSubmit: OWASP LLM01 prompt-injection
  phrase guard plus LLM02 credential-leak detection; exit 2 blocks.

## Connectivity

Every script here is inert on its own — `.claude/settings.json` binds a
script to a lifecycle event; that binding is what makes it a "hook" rather
than a loose shell script. `verify-harness.sh` (one level up, in `.claude/`)
treats every script in this folder as part of the integrity-checked
enforcement layer.

## Parent

[.claude](../README.md)
