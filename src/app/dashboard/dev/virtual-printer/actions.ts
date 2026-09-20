"use server";
import { getVendorSession } from "@/lib/vendor-session";
import { createPrinter, getPrinterByLocation } from "@/lib/printers";
import { mintDeviceCredential } from "@/lib/device-credentials";
import { createServiceClient } from "@/lib/supabase/server";

export type StartVirtualPrinterResult =
  { ok: true; token: string; printerId: string } | { ok: false; error: string };

/**
 * Attaches a virtual printer to one of the vendor's own locations and hands
 * back its device token, so the panel can speak the real CloudPRNT
 * protocol against the real endpoint. Dev and preview only: printing to a
 * browser tab is a test fixture, not a product.
 */
export async function startVirtualPrinter(
  locationId: string,
): Promise<StartVirtualPrinterResult> {
  if (process.env.VERCEL_ENV === "production") {
    return { ok: false, error: "Not available in production." };
  }

  const { user } = await getVendorSession();
  const service = await createServiceClient();

  const { data: location } = await service
    .from("print_locations")
    .select("id")
    .eq("id", locationId)
    .eq("vendor_id", user.id)
    .maybeSingle();

  if (!location) {
    return { ok: false, error: "That booth does not belong to your account." };
  }

  const existing = await getPrinterByLocation(locationId);
  if (existing && existing.catalog_id !== "virtual") {
    return {
      ok: false,
      error: "That booth already has a real printer set up.",
    };
  }

  const printer =
    existing ??
    (await createPrinter({
      vendorId: user.id,
      locationId,
      catalogId: "virtual",
    }));

  if (!printer) {
    return { ok: false, error: "Could not create the virtual printer." };
  }

  const token = await mintDeviceCredential(printer.id, "cloudprnt_url_token");
  if (!token) {
    return { ok: false, error: "Could not create the printer's token." };
  }

  return { ok: true, token, printerId: printer.id };
}
