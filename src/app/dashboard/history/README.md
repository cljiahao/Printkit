# history

## Purpose

Vendor-facing print job history — full list, newest first.

## Contents

- `page.tsx` — server component: `getVendorSession` + `listPrintJobs` + `listActiveLocations` (`@/lib/print-locations`), renders `JobHistoryTable`. Reads the `?unrouted=1` query param (Next 16's `searchParams` prop, a `Promise`) — when present, filters the already-fetched job list in-memory to rows where `location_id` is null and `status` is `queued` before passing it down; this is what the Overview page's unrouted-jobs callout link points at.
- `job-history-table.tsx` — shadcn `Table` of jobs (customer name, order #, booth, status badge, created time, action). The booth column shows the embedded `print_locations.label` for a routed job, or "Unrouted" plus an `AssignLocationControl` when `location_id` is null. The action column renders `ReprintButton` for `failed` rows only. Empty state when there are no jobs yet.
- `assign-location-control.tsx` — client component for manually routing an unrouted job: a one-click "Assign to {label}" button when the vendor has exactly one active location, a shadcn `Select` + confirm button when there are 2+, and nothing when there are none. Calls `assignPrintLocation`.
- `actions.ts` — `reprintJob(jobId)` server action: confirms the job belongs to the calling vendor and is `failed`, resets it to `queued` via `updatePrintJobStatus` (which redelivers it to the bridge over Realtime), logs an `admin_audit` entry, and calls `revalidatePath("/dashboard/history")` so the table reflects the new status without a manual reload. `assignPrintLocation(jobId, locationId)` is a separate sibling action — no status precondition, touches only `location_id` — for routing an unrouted job to a booth. It writes through the service-role client (print_jobs has no UPDATE grant for `authenticated`), first verifying `locationId` belongs to the calling vendor via a `print_locations` lookup scoped by `vendor_id`; also revalidates `/dashboard/history`.
- `reprint-button.tsx` — client component wrapping `reprintJob` with a pending state and a success/error toast.

## Parent

See [../README.md](../README.md).
