import { createServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";

export type CreatePrintJobInput = {
  vendorId: string;
  payload: Record<string, unknown>;
  sourceKit: string;
  sourceRef: string;
};

export type CreatePrintJobResult =
  { ok: true; id: string } | { ok: false; status: number; error: string };

/**
 * Creates a queued print_jobs row. `(source_kit, source_ref)` is unique
 * (0003_printkit_print_jobs_idempotency.sql) — a retried call for the same
 * source order returns a clean 409, not a generic 500.
 */
export async function createPrintJob(
  input: CreatePrintJobInput,
): Promise<CreatePrintJobResult> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("print_jobs")
    .insert({
      vendor_id: input.vendorId,
      job_type: "label",
      payload: input.payload as unknown as Json,
      source_kit: input.sourceKit,
      source_ref: input.sourceRef,
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
    console.error("createPrintJob failed", error.message);
    return { ok: false, status: 500, error: "Could not create print job." };
  }

  return { ok: true, id: data.id };
}
