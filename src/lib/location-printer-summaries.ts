import { createServiceClient } from "@/lib/supabase/server";
import { listActiveLocations } from "@/lib/print-locations";
import { printerState, type PrinterRow } from "@/lib/printers";

type PrinterSummary = Pick<
  PrinterRow,
  "location_id" | "display_name" | "connector" | "catalog_id" | "last_seen_at"
>;

/** Reads active booths and their printers with one vendor-scoped printer query. */
export async function listLocationPrinterSummaries(vendorId: string) {
  const locations = await listActiveLocations(vendorId);
  if (locations.length === 0) return [];
  const service = await createServiceClient();
  const { data, error } = await service
    .from("printers")
    .select("location_id, display_name, connector, catalog_id, last_seen_at")
    .eq("vendor_id", vendorId)
    .in(
      "location_id",
      locations.map((location) => location.id),
    );
  if (error) console.error("Could not read booth printers", error.message);
  const byLocation = new Map<string, PrinterSummary>(
    (error ? [] : (data ?? [])).map((printer) => [
      printer.location_id,
      printer,
    ]),
  );
  return locations.map((location) => {
    const printer = byLocation.get(location.id) ?? null;
    return {
      location,
      printer,
      state: printer
        ? printerState(printer.last_seen_at)
        : ("not_set_up" as const),
    };
  });
}
