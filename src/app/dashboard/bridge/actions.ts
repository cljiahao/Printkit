"use server";
import { updatePrintJobStatus } from "@/lib/print-jobs";
import type { ActionResult } from "@/lib/action-result";

/**
 * Thin wrapper so the bridge's client component can report a print
 * attempt's outcome without importing the service-role print-jobs module
 * directly (server actions are the only server-code path a client
 * component may call). Delegates entirely to updatePrintJobStatus — see
 * Plan 4's Global Constraints on why nothing else writes print_jobs.status.
 */
export async function reportPrintResult(
  jobId: string,
  result: "printed" | "failed",
): Promise<ActionResult> {
  const outcome = await updatePrintJobStatus(jobId, result);
  return outcome.ok
    ? { success: true }
    : { success: false, error: outcome.error };
}
