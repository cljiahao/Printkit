import { createHash, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export async function verifyKitAuth(
  request: Request,
): Promise<{ kitSlug: string } | null> {
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;

  const token = header.slice(prefix.length);
  const sep = token.indexOf(":");
  if (sep <= 0) return null;
  const kitSlug = token.slice(0, sep);
  const secret = token.slice(sep + 1);
  if (!kitSlug || !secret) return null;

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("kit_api_keys")
    .select("secret_hash")
    .eq("kit_slug", kitSlug)
    .maybeSingle();
  if (error || !data) return null;

  const provided = Buffer.from(hashApiKey(secret));
  const expected = Buffer.from(data.secret_hash);
  const ok =
    provided.length === expected.length && timingSafeEqual(provided, expected);
  return ok ? { kitSlug } : null;
}
