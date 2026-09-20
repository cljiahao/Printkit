"use server";
import { getVendorSession } from "@/lib/vendor-session";
import { updatePrintJobStatus } from "@/lib/print-jobs";
import { claimJob, sweepLocation } from "@/lib/job-dispatch";
import {
  createPrinter,
  getPrinterByLocation,
  touchPrinterSeen,
} from "@/lib/printers";
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

/**
 * Verifies a location belongs to the caller. Bridge actions take a location
 * id from the browser, so each one re-derives ownership rather than
 * trusting it.
 */
async function ownedLocation(
  locationId: string,
  vendorId: string,
): Promise<boolean> {
  const service = await createServiceClient();
  const { data } = await service
    .from("print_locations")
    .select("id")
    .eq("id", locationId)
    .eq("vendor_id", vendorId)
    .maybeSingle();

  return data !== null;
}

export type ClaimBridgeJobResult = { ok: true; jobId: string } | { ok: false };

/**
 * A realtime event only says a job exists; this is what decides the bridge
 * may print it. Claiming moves the job to `sent`, so a second bridge (or a
 * second event for the same job) gets nothing back and prints nothing.
 */
export async function claimBridgeJob(
  locationId: string,
  jobId?: string,
): Promise<ClaimBridgeJobResult> {
  const { user } = await getVendorSession();
  if (!(await ownedLocation(locationId, user.id))) return { ok: false };

  const claimed = await claimJob(locationId, jobId);
  return claimed ? { ok: true, jobId: claimed.id } : { ok: false };
}

/**
 * The bridge's health signal, replacing the old realtime presence channel
 * so every connector reports liveness the same way. Also runs the
 * location's lazy sweep, since a bridge beating is the one moment printkit
 * knows someone is watching this booth.
 */
export async function bridgeHeartbeat(locationId: string): Promise<void> {
  const { user } = await getVendorSession();
  if (!(await ownedLocation(locationId, user.id))) return;

  await sweepLocation(locationId);
  const printer = await getPrinterByLocation(locationId);
  if (printer) await touchPrinterSeen(printer);
}

/**
 * Gives a Bluetooth booth its printer row the first time a vendor pairs,
 * so it carries the same connector, driver and health signal as every other
 * printer instead of being a special case.
 */
export async function ensureBridgePrinter(locationId: string): Promise<void> {
  const { user } = await getVendorSession();
  if (!(await ownedLocation(locationId, user.id))) return;

  const existing = await getPrinterByLocation(locationId);
  if (existing) return;

  await createPrinter({
    vendorId: user.id,
    locationId,
    catalogId: "niimbot-b1",
  });
}
