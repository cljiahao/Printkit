import { createServiceClient } from "@/lib/supabase/server";
import { updatePrintJobStatus } from "@/lib/print-jobs";
import { getPrinterByLocation } from "@/lib/printers";
import { JOB_EXPIRY_MS, CONFIRM_TIMEOUT_MS } from "@/lib/job-expiry";
import type { Database } from "@/lib/types";

export type ClaimedJob = Database["printkit"]["Tables"]["print_jobs"]["Row"];

export { JOB_EXPIRY_MS, CONFIRM_TIMEOUT_MS };

/**
 * The only path from 'queued' to 'sent'. The SQL function holds the row
 * lock and the update in one statement, so two devices polling at once can
 * never both claim the same job.
 */
export async function claimJob(
  locationId: string,
  jobId?: string,
): Promise<ClaimedJob | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase.rpc("claim_job", {
    p_location_id: locationId,
    p_job_id: jobId ?? null,
  });

  if (error) {
    console.error("claimJob failed", error.message);
    return null;
  }
  const rows = (data ?? []) as ClaimedJob[];
  return rows[0] ?? null;
}

/**
 * Idempotent timeout pass for one location, run at the start of every pull,
 * status read and vendor_cloud dispatch. There is no scheduler: a location
 * nobody asks about has no jobs waiting on anything either.
 */
export async function sweepLocation(locationId: string): Promise<void> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("print_jobs")
    .select("id, status, created_at, requeued_at, sent_at")
    .eq("location_id", locationId)
    .in("status", ["queued", "sent"]);

  if (error) {
    console.error("sweepLocation failed", error.message);
    return;
  }

  const now = Date.now();
  for (const row of data ?? []) {
    if (row.status === "queued") {
      const since = new Date(row.requeued_at ?? row.created_at).getTime();
      if (now - since > JOB_EXPIRY_MS) {
        await updatePrintJobStatus(row.id, "failed", "expired");
      }
      continue;
    }
    if (row.status === "sent" && row.sent_at) {
      const since = new Date(row.sent_at).getTime();
      if (now - since > CONFIRM_TIMEOUT_MS) {
        await updatePrintJobStatus(row.id, "failed", "device_reported_error");
      }
    }
  }
}

/**
 * Push connectors send immediately; pull connectors wait for the device to
 * ask. Never throws: a dispatch failure must not fail job creation.
 */
export async function dispatchJob(jobId: string): Promise<void> {
  const supabase = await createServiceClient();
  const { data: job, error } = await supabase
    .from("print_jobs")
    .select("id, location_id, status")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !job || !job.location_id) return;

  const printer = await getPrinterByLocation(job.location_id);
  if (!printer) return;
  if (printer.connector !== "vendor_cloud") return;

  await sweepLocation(job.location_id);
}
