import type { SupabaseClient } from "@supabase/supabase-js";
import { callMerqoRpc } from "@/lib/merqo-rpc";

/**
 * Shape returned by merqo's get_or_create_vendor_profile / upsert_vendor_profile.
 * merqo owns this table's real generated types — this is a hand-written
 * mirror of the RPC contract (merqo.* is outside printkit's own
 * `supabase gen types` scope, schema: "printkit").
 */
export type VendorProfile = {
  vendor_id: string;
  stall_name: string;
  social_links: Record<string, string>;
  created_at: string;
  updated_at: string;
};

type GetOrCreateVendorProfileArgs = {
  p_vendor_id: string;
  p_default_stall_name: string | null;
};
type UpsertVendorProfileArgs = {
  p_vendor_id: string;
  p_stall_name: string;
  p_social_links: Record<string, string>;
};

export async function getOrCreateVendorProfile<
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  vendorId: string,
  defaultStallName: string | null,
): Promise<VendorProfile> {
  return callMerqoRpc<
    GetOrCreateVendorProfileArgs,
    VendorProfile,
    Db,
    SchemaName
  >(supabase, "get_or_create_vendor_profile", {
    p_vendor_id: vendorId,
    p_default_stall_name: defaultStallName,
  });
}

export async function upsertVendorProfile<
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  vendorId: string,
  stallName: string,
  socialLinks: Record<string, string>,
): Promise<VendorProfile> {
  return callMerqoRpc<UpsertVendorProfileArgs, VendorProfile, Db, SchemaName>(
    supabase,
    "upsert_vendor_profile",
    {
      p_vendor_id: vendorId,
      p_stall_name: stallName,
      p_social_links: socialLinks,
    },
  );
}
