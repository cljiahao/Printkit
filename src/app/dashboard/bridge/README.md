# Bridge Device Integration

Hooks and components for the bridge device's dashboard, managing real-time job delivery and status synchronization.

The Bridge-mode runtime: Web Bluetooth pairing to a NIIMBOT B1, automatic
printing of any job the Realtime feed delivers, test print, print-failure
UX. This is the only part of printkit that ever touches
`navigator.bluetooth`/`navigator.wakeLock`.

## Contents

- **`page.tsx`** — Server component: calls `getVendorSession`, server-fetches the vendor's `listActiveLocations`, and resolves which `BridgePanel` to render — a `?booth=<id>` search param (matched against a location's `source_ref`, e.g. qkit's own booth id — deep-linked from qkit's booth settings "Choose the printer for this booth" link) skips straight to that location's panel; otherwise auto-selects when there's exactly one location, shows a message pointing to qkit's booth settings when there are none, and renders `BridgeLocationGate` to let the vendor pick when there are 2+.
- **`bridge-location-gate.tsx`** — Client component holding the picked-location state between `page.tsx`'s server-fetched location list and `BridgePanel`: renders `LocationPicker` until a booth is chosen, then renders `BridgePanel` with the resolved `locationId`.
- **`location-picker.tsx`** — Presentational `LocationPicker({locations, onSelect})`: one button per active location, calling `onSelect(id)` on click.
- **`bridge-panel.tsx`** — The Bridge-mode state machine, scoped to a single `locationId` prop: local toggle (persisted via `isBridgeModeEnabled`/`setBridgeModeEnabled`, logs `admin_audit` `bridge_disconnected` on toggle-off), Web Bluetooth pairing (`connectPrinter`/`disconnectPrinter`, logs `admin_audit` `printer_paired` on success, and registers the booth's `niimbot-b1` printer row via `ensureBridgePrinter`), and auto-print on job delivery. The bridge draws nothing itself: a realtime event is only a hint, so each job is first claimed through `claimBridgeJob` (which is what stops two bridges printing the same label), then its PNG is downloaded from `/api/bridge/jobs/[id]/label` and printed, then the outcome is reported. Prints are chained through a ref-held promise queue so two jobs queued close together can't run overlapping Bluetooth sequences. Pairing also claims any job that arrived while the bridge was off and has not expired. A heartbeat every 20 seconds (`bridgeHeartbeat`) is the health signal, replacing the old presence channel. Test print asks the server for a sample label at this booth's own size, verifying the paired printer rather than any real job.
- **`use-job-delivery.ts`** — Subscribes to Supabase Realtime `postgres_changes` on the `print_jobs` table, filtered to a single location. Fires a callback with the job's `id`, `payload`, and `job_type` (defaults to `'label'` if a row somehow lacks one) when a new row arrives with status `queued`, enabling the bridge device to receive print jobs (and their customer/order data) from the calling kit's order system. Re-subscribes on `visibilitychange` since Realtime silently drops a backgrounded tab's connection.
- **`use-wake-lock.ts`** — Owns the Screen Wake Lock: acquired when Bridge mode turns on, re-acquired on `visibilitychange` since a wake lock auto-releases on tab-hide. A sleeping screen takes Bluetooth and the realtime connection with it, which is this transport's documented failure mode. It does not override Battery Saver, so the setup guide tells vendors to turn that off.
- **`actions.ts`** — `reportPrintResult`: confirms the job belongs to the calling vendor (same ownership check as `history/actions.ts`'s `reprintJob`) before delegating to `updatePrintJobStatus`, letting the client-side `BridgePanel` report a print attempt's outcome without importing service-role code directly or being able to flip another vendor's job. `logBridgeEvent(action, detail?)`: writes an `admin_audit` row for bridge-side events (printer paired, bridge disconnected) that aren't a `print_jobs` write. `claimBridgeJob(locationId, jobId?)`: re-derives that the booth belongs to the caller, then claims through `claim_job` — with no `jobId` it claims whatever is waiting, which is how pairing picks up a job queued while the bridge was off. `bridgeHeartbeat(locationId)`: sweeps the booth and stamps the printer's `last_seen_at`. `ensureBridgePrinter(locationId)`: creates the booth's Bluetooth printer row once, so it carries the same connector, driver and health signal as every other printer.

## Known printer quirk

A real NIIMBOT B1 prints the label and then stays silent instead of
acknowledging it, so `printLabel` (`@/lib/niimbot-print`) accepts an
acknowledgement timeout that arrives after the page was sent. Anything
else still fails the job, and the vendor can reprint from History.

## Parent

See [../README.md](../README.md).
