# history

## Purpose

Vendor-facing print job history — full list, newest first.

## Contents

- `page.tsx` — server component: `getVendorSession` + `listPrintJobs`, renders `JobHistoryTable`.
- `job-history-table.tsx` — shadcn `Table` of jobs (customer name, order #, status badge, created time, action). The action column renders `ReprintButton` for `failed` rows only. Empty state when there are no jobs yet.
- `actions.ts` — `reprintJob(jobId)` server action: confirms the job belongs to the calling vendor and is `failed`, resets it to `queued` via `updatePrintJobStatus` (which redelivers it to the bridge over Realtime), and logs an `admin_audit` entry.
- `reprint-button.tsx` — client component wrapping `reprintJob` with a pending state and a success/error toast.

## Parent

See [../README.md](../README.md).
