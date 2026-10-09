import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a `timestamptz` column (e.g. `created_at`) for display, pinned to
 * the `en-SG` locale and the `Asia/Singapore` timezone so the date and time
 * shown never shift depending on the server's runtime timezone — a plain
 * `new Date(isoTimestamp).toLocaleString()` would.
 */
export function formatDateTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    dateStyle: "medium",
    timeStyle: "short",
  });
}
