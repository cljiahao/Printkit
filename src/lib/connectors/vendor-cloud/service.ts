import { getVendorCloudDriver } from "@/lib/connectors/vendor-cloud/drivers";
import { buildLabelLayout } from "@/lib/label-layout";
import { getCatalogEntry } from "@/lib/printer-catalog";
import { updatePrintJobStatus } from "@/lib/print-jobs";
import { createServiceClient } from "@/lib/supabase/server";
import type { PrinterRow } from "@/lib/printers";
import type { Json } from "@/lib/types";

/**
 * Sends a claimed job to the printer maker's cloud and records the maker's
 * own job id, which is what a later status query or callback matches on.
 * The job is already `sent` when this runs, because the claim is what
 * guarantees one send per job.
 */
export async function sendVendorCloudJob(
  job: { id: string; payload: Json },
  printer: PrinterRow,
): Promise<void> {
  const driver = getVendorCloudDriver(printer.driver);
  if (!driver) {
    console.error("vendor-cloud: no driver built for", printer.driver);
    await updatePrintJobStatus(job.id, "failed", "driver_error");
    return;
  }

  if (!printer.device_ref) {
    await updatePrintJobStatus(job.id, "failed", "printer_offline");
    return;
  }

  const layout = buildLabelLayout(job.payload, {
    widthMm: Number(printer.label_width_mm),
    heightMm: Number(printer.label_height_mm),
  });
  const dpi = getCatalogEntry(printer.catalog_id)?.dpi ?? 203;

  const result = await driver.send(printer.device_ref, {
    jobId: job.id,
    layout,
    dpi,
  });

  if (!result.ok) {
    console.error("vendor-cloud: send failed", result.error);
    await updatePrintJobStatus(job.id, "failed", "driver_error");
    return;
  }

  await recordDriverRef(job.id, result.driverRef);
}

async function recordDriverRef(
  jobId: string,
  driverRef: string,
): Promise<void> {
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("print_jobs")
    .update({ driver_ref: driverRef })
    .eq("id", jobId);

  if (error)
    console.error("vendor-cloud: driver_ref write failed", error.message);
}

/**
 * Asks the maker what became of jobs printkit has already sent. This is the
 * fallback for a lost callback, so it only reports a definite outcome and
 * leaves anything still pending for the sweep's own timeout to decide.
 */
export async function reconcileVendorCloudJob(
  job: { id: string; driver_ref: string | null },
  printer: PrinterRow,
): Promise<void> {
  if (!job.driver_ref) return;
  const driver = getVendorCloudDriver(printer.driver);
  if (!driver) return;

  const state = await driver.queryJob(job.driver_ref);
  if (state === "printed") {
    await updatePrintJobStatus(job.id, "printed");
    return;
  }
  if (state === "failed") {
    await updatePrintJobStatus(job.id, "failed", "driver_error");
  }
}
