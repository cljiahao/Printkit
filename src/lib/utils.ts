import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a Postgres `date` column ("YYYY-MM-DD", no time-of-day) for
 * display. Parsed as UTC midnight and formatted with `timeZone: "UTC"` so
 * the date shown never shifts by a day depending on the server's runtime
 * timezone — a plain `new Date(isoDate).toLocaleDateString()` would.
 */
export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-SG", {
    timeZone: "UTC",
  });
}
