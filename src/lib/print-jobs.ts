import { createServiceClient } from "@/lib/supabase/server";
import { notifyQkitPrintStatus } from "@/lib/qkit-client";
import {
  resolveActiveLocation,
  listActiveLocations,
} from "@/lib/print-locations";
import type { Json } from "@/lib/types";

export type CreatePrintJobInput = {
  vendorId: string;
  payload: Record<string, unknown>;
  sourceKit: string;
  sourceRef: string;
  locationRef?: string;
};

export type CreatePrintJobResult =
  { ok: true; id: string } | { ok: false; status: number; error: string };

/**
 * Best-effort `locationRef` -> `location_id` resolution for
 * `createPrintJob` — never throws, since a routing failure must not block
 * job creation. `resolveActiveLocation` isn't itself vendor-scoped, so a
 * match belonging to a different vendor is treated as unresolved rather
 * than silently routing the job somewhere that vendor's bridges will
 * never poll.
 */
async function resolveLocationRef(
  sourceKit: string,
  locationRef: string,
  vendorId: string,
): Promise<string | null> {
  try {
    const location = await resolveActiveLocation(sourceKit, locationRef);
    if (location && location.vendorId === vendorId) return location.id;
  } catch (err) {
    console.error("resolveActiveLocation failed", err);
  }
  return null;
}

/**
 * Single-booth vendors have no routing ambiguity — auto-deliver to their
 * one active location rather than leaving the job permanently unrouted.
 * Best-effort, same never-throws contract as resolveLocationRef.
 */
async function resolveSingleActiveLocation(
  vendorId: string,
): Promise<string | null> {
  try {
    const activeLocations = await listActiveLocations(vendorId);
    if (activeLocations.length === 1) return activeLocations[0].id;
  } catch (err) {
    console.error("listActiveLocations failed", err);
  }
  return null;
}

/**
 * Creates a queued print_jobs row. `(source_kit, source_ref)` is unique
 * (0003_printkit_print_jobs_idempotency.sql) — a retried call for the same
 * source order returns a clean 409, not a generic 500.
 */
export async function createPrintJob(
  input: CreatePrintJobInput,
): Promise<CreatePrintJobResult> {
  let locationId = input.locationRef
    ? await resolveLocationRef(
        input.sourceKit,
        input.locationRef,
        input.vendorId,
      )
    : null;

  if (locationId === null) {
    locationId = await resolveSingleActiveLocation(input.vendorId);
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("print_jobs")
    .insert({
      vendor_id: input.vendorId,
      job_type: "label",
      payload: input.payload as unknown as Json,
      source_kit: input.sourceKit,
      source_ref: input.sourceRef,
      location_id: locationId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        status: 409,
        error: "A print job already exists for this order.",
      };
    }
    if (error.code === "23503") {
      return {
        ok: false,
        status: 400,
        error: "Unknown vendor_id.",
      };
    }
    console.error("createPrintJob failed", error.message);
    return { ok: false, status: 500, error: "Could not create print job." };
  }

  return { ok: true, id: data.id };
}

export type PrintJobStatus = "queued" | "sent" | "printed" | "failed";

export type UpdatePrintJobStatusResult =
  { ok: true } | { ok: false; error: string };

/**
 * The single choke point for changing a print_jobs row's status — every
 * caller (manual reprint, the bridge's print-result handler) is a thin
 * wrapper around this, rather than each reinventing "update the row, then
 * tell qkit".
 */
export async function updatePrintJobStatus(
  jobId: string,
  status: PrintJobStatus,
): Promise<UpdatePrintJobStatusResult> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("print_jobs")
    .update({
      status,
      ...(status === "printed" ? { printed_at: new Date().toISOString() } : {}),
    })
    .eq("id", jobId)
    .select("source_kit, source_ref")
    .single();

  if (error || !data) {
    console.error("updatePrintJobStatus failed", error?.message ?? "not found");
    return { ok: false, error: "Could not update print job status." };
  }

  if (
    data.source_kit === "qkit" &&
    (status === "printed" || status === "failed")
  ) {
    // Fire-and-forget — never throws, must not add qkit's timeout to this call.
    void notifyQkitPrintStatus(data.source_ref, status);
  }

  return { ok: true };
}
