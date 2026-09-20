import { createServiceClient } from "@/lib/supabase/server";
import { getCatalogEntry } from "@/lib/printer-catalog";
import { JOB_EXPIRY_MS } from "@/lib/job-expiry";
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
 * Creates the printer a vendor has chosen for a location. Connector, driver
 * and the default label size come from the catalog rather than the caller,
 * so a device-facing route can never be pointed at a different driver by
 * whoever created the row.
 */
export async function createPrinter(input: {
  vendorId: string;
  locationId: string;
  catalogId: string;
  displayName?: string;
}): Promise<PrinterRow | null> {
  const entry = getCatalogEntry(input.catalogId);
  if (!entry) {
    console.error("createPrinter: unknown catalog id", input.catalogId);
    return null;
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("printers")
    .insert({
      vendor_id: input.vendorId,
      location_id: input.locationId,
      catalog_id: entry.id,
      connector: entry.connector,
      driver: entry.driver,
      display_name: input.displayName ?? `${entry.brand} ${entry.model}`,
      label_width_mm: entry.defaultLabelMm.width,
      label_height_mm: entry.defaultLabelMm.height,
    })
    .select("*")
    .single();

  if (error) {
    console.error("createPrinter failed", error.message);
    return null;
  }
  return data;
}

/**
 * Binds a printer row to the physical device that first presented its
 * credential. Only ever set once: a later device reporting a different id
 * is rejected by the caller rather than silently taking the printer over.
 */
export async function bindDeviceRef(
  printerId: string,
  deviceRef: string,
): Promise<void> {
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("printers")
    .update({ device_ref: deviceRef })
    .eq("id", printerId)
    .is("device_ref", null);

  if (error) console.error("bindDeviceRef failed", error.message);
}

/**
 * The oldest job a device could claim at this location, without claiming
 * it. A poll only answers "is there work", so claiming there would burn the
 * job if the device never came back for it.
 */
export async function peekClaimableJob(
  locationId: string,
): Promise<{ id: string } | null> {
  const supabase = await createServiceClient();
  const cutoff = new Date(Date.now() - JOB_EXPIRY_MS).toISOString();
  const { data, error } = await supabase
    .from("print_jobs")
    .select("id, created_at, requeued_at")
    .eq("location_id", locationId)
    .eq("status", "queued")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("peekClaimableJob failed", error.message);
    return null;
  }

  const claimable = (data ?? [])
    .filter((row) => (row.requeued_at ?? row.created_at) > cutoff)
    .sort((a, b) =>
      (a.requeued_at ?? a.created_at).localeCompare(
        b.requeued_at ?? b.created_at,
      ),
    );

  return claimable[0] ? { id: claimable[0].id } : null;
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
