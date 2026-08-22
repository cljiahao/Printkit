import type { SupabaseClient } from "@supabase/supabase-js";
import { callMerqoRpc } from "@/lib/merqo-rpc";

type SubmitVendorFeedbackArgs = {
  p_kit_slug: string;
  p_nps: number;
  p_message: string | null;
};
type SubmitVendorFeedbackReturns = { id: string };

export async function submitVendorFeedback<
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  kitSlug: string,
  nps: number,
  message: string | null,
): Promise<void> {
  await callMerqoRpc<
    SubmitVendorFeedbackArgs,
    SubmitVendorFeedbackReturns,
    Db,
    SchemaName
  >(supabase, "submit_vendor_feedback", {
    p_kit_slug: kitSlug,
    p_nps: nps,
    p_message: message,
  });
}
