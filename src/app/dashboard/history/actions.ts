"use server";
import { revalidatePath } from "next/cache";
import { getVendorSession } from "@/lib/vendor-session";
import { updatePrintJobStatus } from "@/lib/print-jobs";
import { createServiceClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

/**
 * Only a job's own vendor can reprint it. The `print_jobs` read below uses
 * the session-scoped client from getVendorSession(), so the
 * `print_jobs_vendor_select` RLS policy (`auth.uid() = vendor_id`) already
 * refuses a cross-vendor read as the real authorization boundary; the
 * explicit `.eq("vendor_id", ...)` here is belt-and-braces on top of that,
 * not the sole check. Only a 'failed' job may be reprinted — reprinting a
 * 'queued'/'sent' job would race an in-flight print, and reprinting an
 * already-'printed' one isn't what the print-failure UX this button lives
 * in is for. The service-role client is used only for the write path
 * (updatePrintJobStatus, which bypasses RLS internally) and the
 * admin_audit insert (whose own RLS restricts reads to admins, so writing
 * on behalf of the acting vendor as audit actor needs to bypass that too).
 */
export async function reprintJob(jobId: string): Promise<ActionResult> {
  const { supabase, user } = await getVendorSession();
  const service = await createServiceClient();

  const { data: job } = await supabase
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

  revalidatePath("/dashboard/history");
  return { success: true };
}
