"use server";
import { getVendorSession } from "@/lib/vendor-session";
import { updatePrintJobStatus } from "@/lib/print-jobs";
import { createServiceClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

/**
 * Only a job's own vendor can reprint it — verified by an explicit
 * `vendor_id` check against the service-role client here, since
 * updatePrintJobStatus writes via that same RLS-bypassing client. This
 * check is the actual authorization boundary for this action, not a
 * redundant belt-and-braces one. Only a 'failed' job may be reprinted —
 * reprinting a 'queued'/'sent' job would race an in-flight print, and
 * reprinting an already-'printed' one isn't what the print-failure UX
 * this button lives in is for.
 */
export async function reprintJob(jobId: string): Promise<ActionResult> {
  const { user } = await getVendorSession();
  const service = await createServiceClient();

  const { data: job } = await service
    .from("print_jobs")
    .select("status")
    .eq("id", jobId)
    .eq("vendor_id", user.id)
    .maybeSingle();

  if (!job) return { success: false, error: "Print job not found" };
  if (job.status !== "failed") {
    return { success: false, error: "Only a failed job can be reprinted" };
  }

  const result = await updatePrintJobStatus(jobId, "queued");
  if (!result.ok) return { success: false, error: result.error };

  const { error: auditError } = await service.from("admin_audit").insert({
    admin_id: user.id,
    action: "manual_reprint_triggered",
    target_id: jobId,
    detail: null,
  });
  if (auditError) {
    console.error("reprintJob: admin_audit insert failed", auditError.message);
  }

  return { success: true };
}
