import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";

/**
 * Shared caller for the `merqo` schema's cross-kit RPCs (vendor profile,
 * feedback, support messages) — every sibling kit (qkit/paykit) uses this
 * exact pattern. Callers pass in a client already scoped to their own
 * (printkit) Database and schema name; a bare SupabaseClient defaults its
 * schema-name param to "public", which doesn't structurally match, so this
 * is declared generic over the caller's own Database/SchemaName instead.
 * merqo's real RPC generated types aren't visible from printkit's own
 * `supabase gen types` scope (schema: "printkit") — Args/Returns are each
 * caller's hand-written mirror of the RPC contract, not generated types.
 */
type MerqoSchemaClient<Args, Returns> = {
  schema: (schemaName: "merqo") => {
    rpc: (
      fnName: string,
      args: Args,
    ) => Promise<{ data: Returns; error: PostgrestError | null }>;
  };
};

export async function callMerqoRpc<
  Args,
  Returns,
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  fnName: string,
  args: Args,
): Promise<Returns> {
  const merqoClient = supabase as unknown as MerqoSchemaClient<Args, Returns>;
  const { data, error } = await merqoClient.schema("merqo").rpc(fnName, args);
  if (error) {
    throw new Error(`${fnName} failed: ${error.message}`);
  }
  return data;
}
