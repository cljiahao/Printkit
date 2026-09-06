import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireCurrentLegalAcceptance } from "@/lib/legal-gate";

type VendorSupabaseClient = Awaited<ReturnType<typeof createServerClient>>;
type SessionUser = NonNullable<
  Awaited<ReturnType<VendorSupabaseClient["auth"]["getUser"]>>["data"]["user"]
>;

// Shared dashboard auth guard: gets a session-scoped Supabase client and the
// authenticated user, redirecting to /login if there isn't one. Also bounces
// a signed-in vendor with a stale/missing legal acceptance to /legal/accept —
// this is printkit's single vendor-gate entry point (dashboard/layout.tsx
// calls it), so the legal check lives here once rather than duplicated per
// call site.
export async function getVendorSession(): Promise<{
  supabase: VendorSupabaseClient;
  user: SessionUser;
}> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireCurrentLegalAcceptance(user.email);
  return { supabase, user };
}
