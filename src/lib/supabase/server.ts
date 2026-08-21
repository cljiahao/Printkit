import {
  createServerClient as createSSRClient,
  type CookieMethodsServer,
} from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/types";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function cookieMethods(cookieStore: CookieStore): CookieMethodsServer {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // Read-only context (Server Component) — session refresh handled by middleware
      }
    },
  };
}

export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRClient<Database, "paykit">(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      cookies: cookieMethods(cookieStore),
      db: { schema: "paykit" },
      cookieOptions: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN
        ? { domain: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN }
        : undefined,
    },
  );
}

// Uses the secret key — bypasses RLS. Only use in Server Actions/Route
// Handlers. No request cookies are attached: an empty cookie adapter means
// the secret key drives auth, giving a true RLS bypass instead of silently
// authenticating as whatever user's cookies happened to be present.
export async function createServiceClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey)
    throw new Error(
      "Missing required environment variable: SUPABASE_SECRET_KEY",
    );
  return createSSRClient<Database, "paykit">(publicEnv.supabaseUrl, secretKey, {
    cookies: { getAll: () => [], setAll: () => {} },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: { schema: "paykit" },
  });
}
