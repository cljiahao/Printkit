# Bridge Device Integration

Hooks and components for the bridge device's dashboard, managing real-time job delivery and status synchronization.

The Bridge-mode runtime: Web Bluetooth pairing to a NIIMBOT B1, automatic
printing of any job the Realtime feed delivers, test print, print-failure
UX. This is the only part of printkit that ever touches
`navigator.bluetooth`/`navigator.wakeLock`.

## Contents

- **`page.tsx`** — Server component: calls `getVendorSession` and renders `BridgePanel` for the signed-in vendor.
- **`bridge-panel.tsx`** — The Bridge-mode state machine: local toggle (persisted via `isBridgeModeEnabled`/`setBridgeModeEnabled`, logs `admin_audit` `bridge_disconnected` on toggle-off), Web Bluetooth pairing (`connectPrinter`/`disconnectPrinter`, logs `admin_audit` `printer_paired` on success), auto-print on job delivery via `useJobDelivery` (extracts `customer_name`/`order_number` from the delivered job's payload via `payloadField`, chained through a ref-held promise queue so two jobs queued close together can't run overlapping Bluetooth print sequences), presence + wake lock via `useBridgePresence`, test print, and error toasts.
- **`use-job-delivery.ts`** — Subscribes to Supabase Realtime `postgres_changes` on the `print_jobs` table, filtered to a single location. Fires a callback with the job's `id` and `payload` when a new row arrives with status `queued`, enabling the bridge device to receive print jobs (and their customer/order data) from the qkit order system. Re-subscribes on `visibilitychange` since Realtime silently drops a backgrounded tab's connection.
- **`use-bridge-presence.ts`** — Publishes `.track()` presence on the channel Plan 3's `BridgeStatus` subscribes to (key must be `"bridge"`), and owns the Screen Wake Lock: acquired when Bridge mode turns on, re-acquired on `visibilitychange` since a wake lock auto-releases on tab-hide.
- **`actions.ts`** — `reportPrintResult`: confirms the job belongs to the calling vendor (same ownership check as `history/actions.ts`'s `reprintJob`) before delegating to `updatePrintJobStatus`, letting the client-side `BridgePanel` report a print attempt's outcome without importing service-role code directly or being able to flip another vendor's job. `logBridgeEvent(action, detail?)`: writes an `admin_audit` row for bridge-side events (printer paired, bridge disconnected) that aren't a `print_jobs` write.

## Parent

See [../README.md](../README.md).
