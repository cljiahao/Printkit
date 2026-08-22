# Bridge Device Integration

Hooks and components for the bridge device's dashboard, managing real-time job delivery and status synchronization.

- **`use-job-delivery.ts`** — Subscribes to Supabase Realtime `postgres_changes` on the `print_jobs` table, filtered to a single vendor. Fires a callback when a new job arrives with status `queued`, enabling the bridge device to receive print jobs from the qkit order system.
