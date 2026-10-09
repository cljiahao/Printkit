# Printkit audit, 2026-10-08

## Validation checkpoint

Before the final result-persistence patch, the parent agent measured statements
86.23%, branches 80.57%, functions 81.77%, lines 87.72%. The earlier baseline was
560 passing tests with 81.04%, 76.52%, 69.16%, 82.04%, respectively. Coverage
includes the bridge-agent runtime source. Vitest does not load environment
files (envDir:false). The final patch still requires focused regressions,
formatting, lint, typecheck and a fresh full coverage run; these figures are
not a claim that the final patch passed. No live DB or real printer validation
was performed.

## Defects addressed

- P1: src/app/api/v1/bridge-agent/jobs/[id]/result/route.ts and
  src/app/api/cloudprnt/[token]/route.ts acknowledged results even when
  updatePrintJobStatus failed. The routes now return 500 and apply location
  and sent-state predicates in the UPDATE, preventing a requeue/ownership
  race between the preliminary read and write. Their regression tests assert
  failure responses and predicates; print-jobs.test.ts covers failed atomic
  matches without terminal callback notification.
- P1: src/app/api/feie/callback/route.ts acknowledged transient lookup or
  persistence failure as SUCCESS, losing callbacks. Errors now request retry.
  Unknown and already-settled/requeued jobs remain idempotent acknowledgements.
  Sent state plus signed driver_ref is checked atomically to reject a callback
  for an obsolete delivery attempt.
- P2: src/lib/kit-callback.ts allowed rejected client creation/lookup outside
  its best-effort catch. The entire lookup/send path is now contained.
- P2: src/lib/label-image.ts leaked a decoded bitmap if canvas rendering
  failed. finally closes the bitmap on success and failure.
- P2: src/app/dashboard/printers/setup/setup-wizard.tsx did not recover from
  rejected setup actions. Failure feedback and finally restore the retry UI.

## Necessity and maintainability

The accompanying file inventory lists every tracked path at generation time,
its role, decision and evidence. Nine disconnected generated UI primitives
were removed after reference analysis: avatar, dialog, dropdown-menu,
radio-group, sheet, skeleton, textarea, toggle and toggle-group. Inventory
entries explicitly marked pending still need an individual necessity review;
coverage alone does not establish that every retained file is needed. Public
assets, historical specs, migrations and framework entry points must not be
deleted merely because a static import search finds no consumer.

The status mutation remains centralized in print-jobs.ts; optional predicates
add concurrency protection without duplicating update/callback logic across
connectors. Protected governance files remain unchanged.

## Dependency review and limits

package.json was inspected: Next and eslint-config-next are aligned at 16.3.8,
Vitest and coverage-v8 at 4.1.11; Supabase SSR 0.10.3 and JS 2.48.0 ranges remain
paired. This metadata check is not a vulnerability scan. Parent registry
audit results and remediation need to be recorded after verification. No
package upgrades or dependency removals are made by this patch script.

No deployment, commit, push, live database mutation or secret/environment-file
read was performed. Physical hardware behavior and database isolation require
their dedicated environments; the mocked tests cannot certify them.

## Verified application checkpoint (2026-10-09)

This checkpoint supersedes the earlier pending coverage and quality statements above. The final broad suite passed 692 tests in 87 files. Coverage is 87.63% statements / 82.20% branches / 82.79% functions / 89.07% lines; all four exceed the enforced 80% thresholds. Authored index modules are included. Full ESLint and TypeScript checks pass. Logs: audit-coverage-final.log, audit-eslint-final.log and audit-types-final.log.

The refreshed source ledger records 127 current production TS/TSX/CSS modules, including the bundled hardware agent. The archived unused BackButton is excluded. The virtual printer lifecycle defect is fixed; CloudPRNT tokens and conditional claims/results bind the advertised revision, and reprints compare the captured attempt. Source hashes verify the reviewed checkpoint, not absence of vulnerabilities. Documentation, tests and historical migrations do not all have the same full-content review claim.

Fresh production dependency audit reports zero advisories. The development dependency audit retains one high-severity braces advisory (GHSA-vfj7-8cjw-p6xm); the advertised fixed version was unavailable from the registry during this checkpoint. This remains open. New migrations and rollback-only SQL tests have not been applied/run because Docker’s Linux engine is unavailable. Browser E2E, firmware compatibility and physical printing remain separate validation. No deployment, commit, push, production database mutation or secret-file read is claimed.

Isolated build checkpoint: Next build --webpack passed for a curated temporary copy with sanitized placeholder environment values and no project dotenv files. This verifies compilation, route generation and static prerendering with the webpack path; it does not verify the default Turbopack build, live credentials or deployed integrations.

## Final reviewed checkpoint (2026-10-09)

The final suite passed 705 tests in 88 files. Coverage is 87.76% statements, 82.22% branches, 82.80% functions and 89.24% lines. All four exceed 80%. Lint, types and the isolated secret-free webpack build passed. The separate printer bridge dependency tree retains eight high-severity advisory paths; runtime reachability is not ruled out. Database migrations and SQL tests remain unrun and unapplied, and physical printer validation is outstanding. This review is submitted as a draft PR; no deployment or live database changes are included.
