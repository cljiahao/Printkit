import { createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types";

export type PrinterRow = Database["printkit"]["Tables"]["printers"]["Row"];

export type PrinterState = "online" | "offline" | "not_set_up";

export const HEALTH_ONLINE_MS = 60_000;
export const SEEN_WRITE_THROTTLE_MS = 20_000;

/**
 * One health rule for every connector. "not_set_up" belongs to a location
 * with no printer row at all, which this function never sees, so callers
 * map that case themselves.
 */
export function printerState(
  lastSeenAt: string | null,
  now: Date = new Date(),
): PrinterState {
  if (!lastSeenAt) return "offline";
  const age = now.getTime() - new Date(lastSeenAt).getTime();
  return age <= HEALTH_ONLINE_MS ? "online" : "offline";
}

/**
 * Service-role reads: RLS is bypassed, so each function's own filter is the
 * real scoping, the same convention as print-locations.ts.
 */
export async function getPrinterByLocation(
  locationId: string,
): Promise<PrinterRow | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("printers")
    .select("*")
    .eq("location_id", locationId)
    .maybeSingle();

  if (error) {
    console.error("getPrinterByLocation failed", error.message);
    return null;
  }
  return data ?? null;
}

/**
 * Resolves a device-presented secret to its printer. The caller never sends
 * a printer or vendor id: the credential alone decides which printer, and
 * therefore which vendor, a device-facing request can touch.
 */
export async function getPrinterByTokenHash(
  tokenHash: string,
): Promise<PrinterRow | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("device_credentials")
    .select("printers(*)")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    console.error("getPrinterByTokenHash failed", error.message);
    return null;
  }
  if (!data) return null;
  const joined = (data as unknown as { printers: PrinterRow | null }).printers;
  return joined ?? null;
}

/**
 * Health heartbeat, throttled so a printer polling every few seconds does
 * not write a row on every request.
 */
export async function touchPrinterSeen(printer: PrinterRow): Promise<void> {
  const last = printer.last_seen_at
    ? new Date(printer.last_seen_at).getTime()
    : 0;
  if (Date.now() - last < SEEN_WRITE_THROTTLE_MS) return;

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("printers")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", printer.id);

  if (error) console.error("touchPrinterSeen failed", error.message);
}
