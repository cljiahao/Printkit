import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const FORM_LABEL_CLASS =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

/** Shared inline field-error style across the vendor form pages. */
export const FORM_ERROR_CLASS = "text-sm font-medium text-destructive";

/** Formats an integer cents amount as an SGD currency string ("$4.50"). */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
  }).format(cents / 100);
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
