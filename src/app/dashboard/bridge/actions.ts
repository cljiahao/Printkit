"use server";
import { getVendorSession } from "@/lib/vendor-session";
import { updatePrintJobStatus } from "@/lib/print-jobs";
import { createServiceClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { Json } from "@/lib/types";

/**
 * Only a job's own vendor may report its outcome — same ownership check as
 * reprintJob in history/actions.ts (session-scoped read + explicit
 * vendor_id filter backing print_jobs' RLS), so an arbitrary jobId can't be
 * flipped to printed/failed (and fire a false qkit status callback) by a
 * caller who doesn't own it. Delegates the actual write to
 * updatePrintJobStatus — see Plan 4's Global Constraints on why nothing
 * else writes print_jobs.status.
 */
export async function reportPrintResult(
  jobId: string,
  result: "printed" | "failed",
): Promise<ActionResult> {
  const { supabase, user } = await getVendorSession();

  const { data: job } = await supabase
    .from("print_jobs")
    .select("id")
    .eq("id", jobId)
    .eq("vendor_id", user.id)
    .maybeSingle();

  if (!job) return { success: false, error: "Print job not found" };

  const outcome = await updatePrintJobStatus(jobId, result);
  return outcome.ok
    ? { success: true }
    : { success: false, error: outcome.error };
}

/**
 * admin_audit trail for bridge-side events that aren't a print_jobs write
 * (printer paired, bridge disconnected) — mirrors reprintJob's admin_audit
 * insert shape in history/actions.ts. The acting vendor is the audit actor
 * (admin_audit's own RLS restricts reads to admins, so writing needs the
 * service-role client, same as reprintJob's insert).
 */
export async function logBridgeEvent(
  action: string,
  detail?: Record<string, unknown>,
): Promise<ActionResult> {
  const { user } = await getVendorSession();
  const service = await createServiceClient();

  const { error } = await service.from("admin_audit").insert({
    admin_id: user.id,
    action,
    target_id: null,
    detail: (detail ?? null) as unknown as Json,
  });

  if (error) {
    console.error("logBridgeEvent: admin_audit insert failed", error.message);
    return { success: false, error: "Could not log event." };
  }

  return { success: true };
}
