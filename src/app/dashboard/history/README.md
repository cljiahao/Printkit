# history

## Purpose

Vendor-facing print job history — full list, newest first.

## Contents

- `page.tsx` loads 50 jobs and an older-page cursor using `listPrintHistoryPage`. The validated created_at/id cursor preserves stable ordering; unrouted filtering happens in the database before the limit. Queries continue across lower server caps and errors propagate to the route error boundary.
- `job-history-table.tsx` — shadcn `Table` of jobs (customer name, order #, booth, status badge, created time, action). The booth column shows the embedded `print_locations.label` for a routed job, or "Unrouted" plus an `AssignLocationControl` when `location_id` is null. The action column renders `ReprintButton` for `failed` or already-`printed` rows (a vendor who lost/peeled a good label can reprint it too, not just a genuine failure) — `queued`/`sent` stay excluded, since reprinting either would race an in-flight print. Empty state when there are no jobs yet.
- `assign-location-control.tsx` — client component for manually routing an unrouted job: a one-click "Assign to {label}" button when the vendor has exactly one active location, a shadcn `Select` + confirm button when there are 2+, and nothing when there are none. Calls `assignPrintLocation`.
- `actions.ts` — `reprintJob(jobId)` server action: confirms the job belongs to the calling vendor and is `failed` or already `printed`, resets it to `queued` via `updatePrintJobStatus` (which stamps `requeued_at`, restarting the 30-minute expiry), hands it to `dispatchJob` so a brand-cloud printer gets it straight away (polling printers and bridges pick it up on their next poll), logs an `admin_audit` entry, and calls `revalidatePath("/dashboard/history")` so the table reflects the new status without a manual reload. `assignPrintLocation(jobId, locationId)` is a separate sibling action that atomically requires an unrouted queued job, touches only `location_id` and `requeued_at` (so a long-unrouted job does not expire the moment it is routed), then dispatches it the same way — for routing an unrouted job to a booth. It writes through the service-role client (print_jobs has no UPDATE grant for `authenticated`), first verifying `locationId` belongs to the calling vendor via a `print_locations` lookup scoped by `vendor_id`; also revalidates `/dashboard/history`.
- `reprint-button.tsx` — client component wrapping `reprintJob` with a pending state and a success/error toast.

## Parent

See [../README.md](../README.md).

Reprint compares the observed terminal status and both sent/requeue timestamps
in its conditional write. A delayed request from an earlier printed attempt
cannot enqueue another print after a newer attempt reaches the same status.
