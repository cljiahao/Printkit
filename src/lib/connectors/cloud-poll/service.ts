import { hashDeviceToken } from "@/lib/device-credentials";
import { getPrinterByTokenHash, type PrinterRow } from "@/lib/printers";
import { renderJobForPrinter } from "@/lib/render-job";
import { createServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";

/**
 * Resolves the device's URL token to its printer. The token is the whole
 * credential: nothing else in a device request is trusted, so a caller
 * cannot name a printer, vendor or location it does not hold a token for.
 */
export async function resolveDevice(token: string): Promise<PrinterRow | null> {
  if (!token) return null;
  const printer = await getPrinterByTokenHash(hashDeviceToken(token));
  if (!printer) return null;
  return printer.connector === "cloud_poll" ? printer : null;
}

/**
 * Renders a claimed job for this printer: the label layout is built at the
 * printer's own configured label size, then rasterized at its dpi.
 */
export async function renderJobPng(
  job: { payload: Json },
  printer: PrinterRow,
): Promise<Buffer> {
  return renderJobForPrinter(job.payload, printer);
}

/**
 * Whether this device may report an outcome for a job: it must be at the
 * device's own location, or a printer holding one token could mark another
 * printer's jobs printed, and still `sent`, so a late or repeated
 * confirmation cannot overwrite a job the vendor has since requeued.
 */
export async function awaitsConfirmation(
  jobId: string,
  locationId: string,
): Promise<boolean> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("print_jobs")
    .select("id")
    .eq("id", jobId)
    .eq("location_id", locationId)
    .eq("status", "sent")
    .maybeSingle();

  if (error) {
    console.error("awaitsConfirmation failed", error.message);
    return false;
  }
  return data !== null;
}

/**
 * The job a token-less confirmation refers to. Star firmware older than
 * token support (for example mC-Print3 before 3.2) confirms without naming
 * the job, so the only honest reading is "the one this location sent
 * last": a cloud_poll printer fetches one job at a time.
 */
export async function latestSentJobId(
  locationId: string,
): Promise<string | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("print_jobs")
    .select("id")
    .eq("location_id", locationId)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("latestSentJobId failed", error.message);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Records a device-level event worth disputing later (a printer presenting
 * a token bound to different hardware). Never throws: an audit failure must
 * not change what the route answers.
 */
export async function logDeviceEvent(
  printer: PrinterRow,
  action: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = await createServiceClient();
    const { error } = await supabase.from("admin_audit").insert({
      admin_id: printer.vendor_id,
      action,
      target_id: printer.id,
      detail: detail as unknown as Json,
    });
    if (error) console.error("logDeviceEvent failed", error.message);
  } catch (err) {
    console.error("logDeviceEvent threw", err);
  }
}
