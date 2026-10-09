import { hashDeviceToken } from "@/lib/device-credentials";
import { getPrinterByTokenHash, type PrinterRow } from "@/lib/printers";
import { renderJobForPrinter } from "@/lib/render-job";
import { createServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";
import type { ClaimedJob } from "@/lib/job-dispatch";
import {
  cloudPollJobId,
  cloudPollJobToken,
  type CloudPollRevision,
} from "./job-token";

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

// The device credential scopes the location; the opaque token scopes its revision.
export async function readCloudPollJob(
  token: string | null,
  locationId: string,
): Promise<ClaimedJob | null> {
  const jobId = cloudPollJobId(token);
  if (!jobId) return null;
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("print_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("location_id", locationId)
    .maybeSingle();
  if (error) {
    console.error("readCloudPollJob failed", error.message);
    return null;
  }
  return data && cloudPollJobToken(data) === token ? data : null;
}

export async function claimCloudPollJob(
  locationId: string,
  revision: CloudPollRevision,
): Promise<ClaimedJob | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase.rpc("claim_cloud_poll_job", {
    p_location_id: locationId,
    p_job_id: revision.id,
    p_created_at: revision.created_at,
    p_requeued_at: revision.requeued_at,
  });
  if (error) {
    console.error("claimCloudPollJob failed", error.message);
    return null;
  }
  return data?.[0] ?? null;
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
