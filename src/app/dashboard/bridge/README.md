# Bridge Device Integration

Hooks and components for the bridge device's dashboard, managing real-time job delivery and status synchronization.

The Bridge-mode runtime: Web Bluetooth pairing to a NIIMBOT B1, automatic
printing of any job the Realtime feed delivers, test print, print-failure
UX. This is the only part of printkit that ever touches
`navigator.bluetooth`/`navigator.wakeLock`.

## Contents

- **`page.tsx`** — Server component: calls `getVendorSession` and renders `BridgePanel` for the signed-in vendor.
- **`bridge-panel.tsx`** — The Bridge-mode state machine: local toggle (persisted via `isBridgeModeEnabled`/`setBridgeModeEnabled`), Web Bluetooth pairing (`connectPrinter`/`disconnectPrinter`), auto-print on job delivery via `useJobDelivery`, presence + wake lock via `useBridgePresence`, test print, and error toasts.
- **`use-job-delivery.ts`** — Subscribes to Supabase Realtime `postgres_changes` on the `print_jobs` table, filtered to a single vendor. Fires a callback when a new job arrives with status `queued`, enabling the bridge device to receive print jobs from the qkit order system. Re-subscribes on `visibilitychange` since Realtime silently drops a backgrounded tab's connection.
- **`use-bridge-presence.ts`** — Publishes `.track()` presence on the channel Plan 3's `BridgeStatus` subscribes to (key must be `"bridge"`), and owns the Screen Wake Lock: acquired when Bridge mode turns on, re-acquired on `visibilitychange` since a wake lock auto-releases on tab-hide.
- **`actions.ts`** — `reportPrintResult`: thin server-action wrapper around `updatePrintJobStatus`, letting the client-side `BridgePanel` report a print attempt's outcome without importing service-role code directly.

## Parent

See [../README.md](../README.md).
