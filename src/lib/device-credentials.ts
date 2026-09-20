import { createHash, randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

export type DeviceCredentialKind = "cloudprnt_url_token" | "bridge_agent_token";

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Mints the secret a device presents to printkit, and returns it once. Only
 * its hash is stored, so a leaked database row cannot be replayed as a
 * device. Minting again for the same printer replaces the old credential,
 * which is how rotation and "this printer was stolen" are handled.
 */
export async function mintDeviceCredential(
  printerId: string,
  kind: DeviceCredentialKind,
): Promise<string | null> {
  const token = randomBytes(32).toString("base64url");
  const supabase = await createServiceClient();

  const { error } = await supabase.from("device_credentials").upsert(
    {
      printer_id: printerId,
      kind,
      token_hash: hashDeviceToken(token),
      rotated_at: new Date().toISOString(),
    },
    { onConflict: "printer_id" },
  );

  if (error) {
    console.error("mintDeviceCredential failed", error.message);
    return null;
  }
  return token;
}

export async function revokeDeviceCredential(printerId: string): Promise<void> {
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("device_credentials")
    .delete()
    .eq("printer_id", printerId);

  if (error) console.error("revokeDeviceCredential failed", error.message);
}
