import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import type { PrintJobStatus } from "@/lib/print-jobs";

/**
 * `print_jobs.status`/`job_type` come back as plain `string` from the
 * generated `Database` type (Postgres CHECK constraints don't reflect as
 * TS literal unions) — this narrows them to the real literal types at the
 * one read boundary every dashboard page goes through, instead of every
 * caller re-deriving/re-casting it.
 */
export type PrintJob = Omit<
  Database["printkit"]["Tables"]["print_jobs"]["Row"],
  "status" | "job_type"
> & {
  status: PrintJobStatus;
  job_type: "label";
};

/**
 * Vendor's own job history, newest first — relies on print_jobs' RLS
 * policy (vendor reads only their own rows) as the real authorization
 * boundary; the explicit .eq("vendor_id", ...) here is defense in depth,
 * not the sole guard.
 */
export async function listPrintJobs(
  supabase: SupabaseClient<Database, "printkit">,
  vendorId: string,
  limit = 50,
): Promise<PrintJob[]> {
  const { data, error } = await supabase
    .from("print_jobs")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listPrintJobs failed", error.message);
    return [];
  }
  return (data ?? []) as PrintJob[];
}
