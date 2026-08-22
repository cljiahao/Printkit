import type { Json } from "@/lib/types";

/**
 * print_jobs.payload is jsonb (untyped Json) — this is the one place that
 * narrows a field out of it defensively, shared by the history table and
 * the bridge's auto-print label so both treat a missing/non-string field
 * the same way.
 */
export function payloadField(
  payload: Json,
  key: string,
  fallback = "—",
): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    return fallback;
  const value = payload[key];
  return typeof value === "string" ? value : fallback;
}
