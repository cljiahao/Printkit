import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

type VendorSupabaseClient = Awaited<ReturnType<typeof createServerClient>>;
type SessionUser = NonNullable<
  Awaited<ReturnType<VendorSupabaseClient["auth"]["getUser"]>>["data"]["user"]
>;

// Shared dashboard auth guard: gets a session-scoped Supabase client and the
// authenticated user, redirecting to /login if there isn't one.
export async function getVendorSession(): Promise<{
  supabase: VendorSupabaseClient;
  user: SessionUser;
}> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}
