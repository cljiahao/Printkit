import { createServiceClient } from "@/lib/supabase/server";

export type CreateLocationInput = {
  vendorId: string;
  sourceKit: string;
  sourceRef: string;
  label: string;
  active: boolean;
};

export type CreateLocationResult =
  { ok: true; id: string } | { ok: false; status: number; error: string };

export async function createOrUpdatePrintLocation(
  args: CreateLocationInput,
): Promise<CreateLocationResult> {
  const service = await createServiceClient();
  const { data, error } = await service
    .from("print_locations")
    .upsert(
      {
        vendor_id: args.vendorId,
        source_kit: args.sourceKit,
        source_ref: args.sourceRef,
        label: args.label,
        active: args.active,
      },
      { onConflict: "source_kit,source_ref" },
    )
    .select("id")
    .single();

  if (error || !data) {
    console.error("createOrUpdatePrintLocation failed", error?.message);
    return { ok: false, status: 500, error: "Could not save print location." };
  }
  return { ok: true, id: data.id };
}

export async function resolveActiveLocation(
  sourceKit: string,
  sourceRef: string,
): Promise<{ id: string; vendorId: string } | null> {
  const service = await createServiceClient();
  const { data, error } = await service
    .from("print_locations")
    .select("id, vendor_id")
    .eq("source_kit", sourceKit)
    .eq("source_ref", sourceRef)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    console.error("resolveActiveLocation failed", error.message);
  }
  if (!data) return null;
  return { id: data.id, vendorId: data.vendor_id };
}

export async function listActiveLocations(
  vendorId: string,
): Promise<{ id: string; label: string; source_ref: string }[]> {
  const service = await createServiceClient();
  const { data, error } = await service
    .from("print_locations")
    .select("id, label, source_ref")
    .eq("vendor_id", vendorId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("listActiveLocations failed", error?.message);
    return [];
  }
  return data;
}
