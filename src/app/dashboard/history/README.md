# history

## Purpose

Vendor-facing print job history — full list, newest first.

## Contents

- `page.tsx` — server component: `getVendorSession` + `listPrintJobs`, renders `JobHistoryTable`.
- `job-history-table.tsx` — shadcn `Table` of jobs (customer name, order #, status badge, created time). Empty state when there are no jobs yet. Plan 4 adds a reprint button here for `failed` rows.

## Parent

See [../README.md](../README.md) (not yet created — see repo root `README.md` for the full layout until it is).
