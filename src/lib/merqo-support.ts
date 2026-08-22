import type { SupabaseClient } from "@supabase/supabase-js";
import { callMerqoRpc } from "@/lib/merqo-rpc";

type SubmitSupportMessageArgs = {
  p_kit_slug: string;
  p_category: string;
  p_body: string;
};
type SubmitSupportMessageReturns = { id: string };

export async function submitSupportMessage<
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  category: string,
  body: string,
): Promise<void> {
  await callMerqoRpc<
    SubmitSupportMessageArgs,
    SubmitSupportMessageReturns,
    Db,
    SchemaName
  >(supabase, "submit_support_message", {
    p_kit_slug: "printkit",
    p_category: category,
    p_body: body,
  });
}
