import { createServiceClient } from "@/lib/supabase/server";
import { updatePrintJobStatus } from "@/lib/print-jobs";
import { getPrinterByLocation, type PrinterRow } from "@/lib/printers";
import {
  sendVendorCloudJob,
  reconcileVendorCloudJob,
} from "@/lib/connectors/vendor-cloud/service";
import {
  JOB_EXPIRY_MS,
  CONFIRM_TIMEOUT_MS,
  VENDOR_CLOUD_CONFIRM_TIMEOUT_MS,
} from "@/lib/job-expiry";
import type { Database, Json } from "@/lib/types";

export type ClaimedJob = Database["printkit"]["Tables"]["print_jobs"]["Row"];

export { JOB_EXPIRY_MS, CONFIRM_TIMEOUT_MS };

const RECONCILE_AFTER_MS = 60_000;
const RECONCILE_LIMIT = 10;

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

type SweepRow = {
  id: string;
  status: string;
  created_at: string;
  requeued_at: string | null;
  sent_at: string | null;
  driver_ref: string | null;
};

function confirmTimeoutFor(printer: PrinterRow | null): number {
  return printer?.connector === "vendor_cloud"
    ? VENDOR_CLOUD_CONFIRM_TIMEOUT_MS
    : CONFIRM_TIMEOUT_MS;
}

/**
 * A job nobody collected in time is failed rather than printed later: a
 * printer switched on the next morning must not print yesterday's labels.
 */
async function expireIfStale(
  row: SweepRow,
  now: number,
  locationId: string,
): Promise<void> {
  const since = new Date(row.requeued_at ?? row.created_at).getTime();
  if (now - since > JOB_EXPIRY_MS) {
    await updatePrintJobStatus(row.id, "failed", "expired", {
      locationId,
      expectedStatus: "queued",
      requeuedAt: row.requeued_at,
    });
  }
}

function shouldReconcile(
  row: SweepRow,
  printer: PrinterRow | null,
  age: number,
  budget: number,
): boolean {
  return (
    printer?.connector === "vendor_cloud" &&
    row.driver_ref !== null &&
    age > RECONCILE_AFTER_MS &&
    budget > 0
  );
}

/**
 * Decides what became of a job already handed over. Returns whether it
 * spent one of the sweep's maker-query allowance.
 */
async function resolveSentJob(
  row: SweepRow,
  printer: PrinterRow | null,
  now: number,
  budget: number,
  locationId: string,
): Promise<boolean> {
  if (!row.sent_at) return false;
  const age = now - new Date(row.sent_at).getTime();

  const reconcile =
    shouldReconcile(row, printer, age, budget) && printer !== null;
  if (reconcile && printer) {
    const terminal = await reconcileVendorCloudJob(row, printer);
    if (terminal) return true;
  }

  if (age > confirmTimeoutFor(printer)) {
    await updatePrintJobStatus(
      row.id,
      "failed",
      printer?.connector === "vendor_cloud"
        ? "driver_error"
        : "device_reported_error",
      { locationId, expectedStatus: "sent", sentAt: row.sent_at },
    );
  }
  return reconcile;
}

async function readSweepRows(locationId: string): Promise<SweepRow[] | null> {
  const supabase = await createServiceClient();
  const rows: SweepRow[] = [];
  let cursor: string | null = null;
  while (true) {
    let query = supabase
      .from("print_jobs")
      .select("id, status, created_at, requeued_at, sent_at, driver_ref")
      .eq("location_id", locationId)
      .in("status", ["queued", "sent"]);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query
      .order("id", { ascending: true })
      .limit(500);
    if (error) {
      console.error("sweepLocation failed", error.message);
      return null;
    }
    const batch = (data ?? []) as SweepRow[];
    if (!batch.length) break;
    const next = batch[batch.length - 1].id;
    if (cursor && next <= cursor) {
      console.error("sweepLocation cursor did not advance");
      return null;
    }
    rows.push(...batch);
    cursor = next;
  }
  return rows;
}

/**
 * Idempotent timeout pass for one location, run at the start of every pull,
 * status read and push dispatch. There is no scheduler: a location nobody
 * asks about has no jobs waiting on anything either.
 */
export async function sweepLocation(locationId: string): Promise<void> {
  const rows = await readSweepRows(locationId);
  if (!rows || rows.length === 0) return;

  const printer = await getPrinterByLocation(locationId);
  const now = Date.now();
  let budget = RECONCILE_LIMIT;

  for (const row of rows) {
    if (row.status === "queued") {
      await expireIfStale(row, now, locationId);
      continue;
    }
    if (row.status !== "sent") continue;

    const spent = await resolveSentJob(row, printer, now, budget, locationId);
    if (spent) budget -= 1;
  }
}

/**
 * Push connectors send after an atomic claim; pull connectors wait for the
 * device. Callers catch dispatch failures separately from successful creation
 * or requeue, so delivery outages do not change those primary results.
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

  const claimed = await claimJob(job.location_id, job.id);
  if (!claimed) return;

  await sendVendorCloudJob(
    {
      id: claimed.id,
      payload: claimed.payload as Json,
      sent_at: claimed.sent_at,
    },
    printer,
  );
}
