import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/types";

export function createClient() {
  return createBrowserClient<Database, "printkit">(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      db: { schema: "printkit" },
      cookieOptions: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN
        ? { domain: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN }
        : undefined,
    },
  );
}
