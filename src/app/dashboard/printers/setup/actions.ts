"use server";
import { getVendorSession } from "@/lib/vendor-session";
import {
  createPrinter,
  getPrinterByLocation,
  printerState,
  type PrinterRow,
} from "@/lib/printers";
import { mintDeviceCredential } from "@/lib/device-credentials";
import { createPairingCode, formatPairingCode } from "@/lib/bridge-pairing";
import { getCatalogEntry } from "@/lib/printer-catalog";
import { getVendorCloudDriver } from "@/lib/connectors/vendor-cloud/drivers";
import { createServiceClient } from "@/lib/supabase/server";

export type SetupResult<T> = ({ ok: true } & T) | { ok: false; error: string };

async function ownedLocation(
  locationId: string,
  vendorId: string,
): Promise<boolean> {
  const service = await createServiceClient();
  const { data } = await service
    .from("print_locations")
    .select("id")
    .eq("id", locationId)
    .eq("vendor_id", vendorId)
    .maybeSingle();
  return data !== null;
}

/**
 * One printer per booth, and the model decides its connector, so a booth
 * that already has a different printer has to be cleared first rather than
 * silently re-pointed.
 */
async function printerFor(
  locationId: string,
  catalogId: string,
  vendorId: string,
): Promise<PrinterRow | null> {
  const existing = await getPrinterByLocation(locationId);
  if (existing) {
    return existing.catalog_id === catalogId ? existing : null;
  }
  return createPrinter({ vendorId, locationId, catalogId });
}

/**
 * Cloud printers authenticate by the URL alone, so the vendor sees it once
 * here and pastes it into the printer's own settings page. Asking again
 * mints a new URL and retires the old one.
 */
export async function createPrinterUrl(
  locationId: string,
  catalogId: string,
): Promise<SetupResult<{ url: string }>> {
  const { user } = await getVendorSession();
  if (!(await ownedLocation(locationId, user.id))) {
    return { ok: false, error: "That booth does not belong to your account." };
  }

  const printer = await printerFor(locationId, catalogId, user.id);
  if (!printer) {
    return {
      ok: false,
      error: "That booth already has a different printer. Remove it first.",
    };
  }

  const token = await mintDeviceCredential(printer.id, "cloudprnt_url_token");
  if (!token) {
    return { ok: false, error: "Could not create the printer's address." };
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return { ok: true, url: `${base}/api/cloudprnt/${token}` };
}

/**
 * The vendor reads the SN and KEY off the printer. The KEY proves they hold
 * the device; it is sent to the maker once and never stored here.
 */
export async function registerBrandCloudPrinter(
  locationId: string,
  catalogId: string,
  sn: string,
  key: string,
): Promise<SetupResult<{ state: string }>> {
  const { user } = await getVendorSession();
  if (!(await ownedLocation(locationId, user.id))) {
    return { ok: false, error: "That booth does not belong to your account." };
  }

  const entry = getCatalogEntry(catalogId);
  const driver = entry ? getVendorCloudDriver(entry.driver) : null;
  if (!entry || !driver) {
    return { ok: false, error: "That printer is not supported yet." };
  }

  const printer = await printerFor(locationId, catalogId, user.id);
  if (!printer) {
    return {
      ok: false,
      error: "That booth already has a different printer. Remove it first.",
    };
  }

  const registered = await driver.registerPrinter({
    sn,
    key,
    name: printer.display_name,
  });
  if (!registered.ok) return { ok: false, error: registered.error };

  const service = await createServiceClient();
  const { error } = await service
    .from("printers")
    .update({ device_ref: registered.deviceRef })
    .eq("id", printer.id);

  if (error) {
    console.error("registerBrandCloudPrinter: save failed", error.message);
    return { ok: false, error: "Could not save the printer." };
  }

  const state = await driver.queryPrinter(registered.deviceRef);
  return { ok: true, state };
}

/**
 * A Raspberry Pi cannot hold a vendor session, so it pairs with a code the
 * vendor reads off this screen. Single use, ten minutes.
 */
export async function createBridgePairingCode(
  locationId: string,
): Promise<SetupResult<{ code: string }>> {
  const { user } = await getVendorSession();
  if (!(await ownedLocation(locationId, user.id))) {
    return { ok: false, error: "That booth does not belong to your account." };
  }

  const printer = await printerFor(locationId, "niimbot-b1", user.id);
  if (!printer) {
    return {
      ok: false,
      error: "That booth already has a different printer. Remove it first.",
    };
  }

  const code = await createPairingCode(printer.id);
  if (!code) {
    return { ok: false, error: "Could not create a pairing code." };
  }
  return { ok: true, code: formatPairingCode(code) };
}

/**
 * Polled by the setup screens while they wait for a printer to say hello,
 * so a vendor watching the page sees it connect without refreshing.
 */
export async function readPrinterState(
  locationId: string,
): Promise<"online" | "offline" | "not_set_up"> {
  const { user } = await getVendorSession();
  if (!(await ownedLocation(locationId, user.id))) return "not_set_up";

  const printer = await getPrinterByLocation(locationId);
  if (!printer) return "not_set_up";
  return printerState(printer.last_seen_at);
}
