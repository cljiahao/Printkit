# Printkit component reuse specification

Confirmed against main 3ead5df on 2026-10-10 before application edits.

## Scope

Batch the verified vendor's active-location printer summaries into one printer query; preserve missing printers and location order. Reuse shared DataTable for job rows while retaining queued-only assignment and terminal-only reprint. Split connector setup into local connector files sharing Step and WaitingForPrinter. Reuse Wordmark in navigation. Recover login controls on unexpected OAuth/password rejections and cover retry. Remove the unused formatDate utility and use Singapore timestamp formatting for offline printer display. Correct current-contract comments and nearby README descriptions.

Shared InfoTooltip integration is dependent on root's tested trigger/icon class slots and immutable shared UI SHA. Keep 24px tap target, keyboard opening, Escape/focus return and title/body content.

## Acceptance

- Loader uses vendor_id plus allowed active location IDs and selects only fields required by server-rendered pages. No empty IN call or cross-vendor cache. Missing/error printer rows remain safely not-set-up; tests assert filters, ordering, missing rows and errors.
- Login failures restore controls, preserve entered fields and display actionable errors; successful OAuth/navigation retains busy state while leaving. Signup without session displays email confirmation.
- History keeps all six columns, empty presentation, row identity and action eligibility.
- Setup preserves credential clearing, opaque expiring pairing codes, private URL copy handling, polling teardown and safe retry.
- Existing print/Bluetooth state machines, authorization, schemas, migrations, governance, Qkit and other kits remain outside scope.
- Focused regressions, pnpm check, full test coverage with all four aggregate measures >=80%, production dependency audit and redacted official gitleaks scan pass before PR. Sanitized build verification must not load actual env files.

## Structure decisions

Retain valid Next colocation and Supabase/RLS divergence. Do not create a generic hardware wizard, cross-kit print library, broad barrel exports or unnecessary global wrappers. Delete generated primitive files only after all production imports are eliminated, never partially rewrite their CLI-generated internals.
