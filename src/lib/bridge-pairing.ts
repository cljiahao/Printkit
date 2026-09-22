import { randomInt } from "node:crypto";
import { hashDeviceToken } from "@/lib/device-credentials";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * No 0/O/1/I: a vendor reads this code off a screen and types it into a
 * Raspberry Pi over SSH, so the alphabet avoids the characters people
 * confuse.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const TTL_MS = 10 * 60_000;

export function formatPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/**
 * Mints a short-lived code that lets one agent claim one printer. Only its
 * hash is stored, so the code cannot be read back out of the database, and
 * it is single use.
 */
export async function createPairingCode(
  printerId: string,
): Promise<string | null> {
  const code = generateCode();
  const supabase = await createServiceClient();

  const { error } = await supabase.from("bridge_pairing_codes").insert({
    code_hash: hashDeviceToken(code),
    printer_id: printerId,
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  });

  if (error) {
    console.error("createPairingCode failed", error.message);
    return null;
  }
  return code;
}

/**
 * Spends a pairing code. Returns the printer it was minted for, or null if
 * the code is unknown, already used or expired. The row is marked used
 * before the caller gets anything back, so two agents racing the same code
 * cannot both pair.
 */
export async function redeemPairingCode(code: string): Promise<string | null> {
  const supabase = await createServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("bridge_pairing_codes")
    .update({ used_at: now })
    .eq("code_hash", hashDeviceToken(code.replace(/-/g, "").toUpperCase()))
    .is("used_at", null)
    .gt("expires_at", now)
    .select("printer_id")
    .maybeSingle();

  if (error) {
    console.error("redeemPairingCode failed", error.message);
    return null;
  }
  return data?.printer_id ?? null;
}
