"use server";
import { revalidatePath } from "next/cache";
import { getVendorSession } from "@/lib/vendor-session";
import { updatePrintJobStatus } from "@/lib/print-jobs";
import { dispatchJob } from "@/lib/job-dispatch";
import { createServiceClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

/**
 * The session-scoped read enforces vendor RLS. Only failed or printed jobs may
 * be requeued; comparing status and attempt prevents stale concurrent reprints.
 * Audit failure must not disguise a successful requeue as a failed request.
 */
export async function reprintJob(jobId: string): Promise<ActionResult> {
  const { supabase, user } = await getVendorSession();
  const service = await createServiceClient();

  const { data: job } = await supabase
    .from("print_jobs")
    .select("status, sent_at, requeued_at")
    .eq("id", jobId)
    .eq("vendor_id", user.id)
    .maybeSingle();

  if (!job) return { success: false, error: "Print job not found" };
  if (job.status !== "failed" && job.status !== "printed") {
    return {
      success: false,
      error: "Only a failed or already-printed job can be reprinted",
    };
  }

  const result = await updatePrintJobStatus(jobId, "queued", undefined, {
    expectedStatus: job.status,
    sentAt: job.sent_at,
    requeuedAt: job.requeued_at,
  });
  if (!result.ok) return { success: false, error: result.error };

  dispatchJob(jobId).catch((err: unknown) => {
    console.error("reprintJob: dispatchJob failed", err);
  });

  try {
    const { error: auditError } = await service.from("admin_audit").insert({
      admin_id: user.id,
      action: "manual_reprint_triggered",
      target_id: jobId,
      detail: null,
    });
    if (auditError)
      console.error(
        "reprintJob: admin_audit insert failed",
        auditError.message,
      );
  } catch (error) {
    console.error("reprintJob: admin_audit insert rejected", error);
  }

  revalidatePath("/dashboard/history");
  return { success: true };
}

/**
 * Assigns only an unrouted queued job. The service write checks vendor ownership
 * and the current routing state atomically because authenticated clients cannot
 * update print_jobs. The destination must also belong to the acting vendor.
 */
export async function assignPrintLocation(
  jobId: string,
  locationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await getVendorSession();
  const service = await createServiceClient();

  const { data: location } = await service
    .from("print_locations")
    .select("id")
    .eq("id", locationId)
    .eq("vendor_id", user.id)
    .maybeSingle();

  if (!location) {
    return { ok: false, error: "That booth doesn't belong to your account." };
  }

  const { data: assigned, error } = await service
    .from("print_jobs")
    .update({
      location_id: locationId,
      requeued_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("vendor_id", user.id)
    .eq("status", "queued")
    .is("location_id", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("assignPrintLocation failed", error.message);
    return { ok: false, error: "Could not assign a booth to this job." };
  }

  if (!assigned) {
    return { ok: false, error: "This job is no longer waiting for a booth." };
  }

  dispatchJob(jobId).catch((err: unknown) => {
    console.error("assignPrintLocation: dispatchJob failed", err);
  });

  revalidatePath("/dashboard/history");
  return { ok: true };
}
