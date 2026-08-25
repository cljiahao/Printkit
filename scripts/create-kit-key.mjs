#!/usr/bin/env node
// Generates a bearer secret for a new calling kit and stores its SHA-256 hash
// in printkit.kit_api_keys. Prints the plaintext secret ONCE -- printkit
// never stores or displays it again. Optional callback_url/callback_secret
// (plaintext, since printkit must present them, not just verify them) are
// left untouched on a re-run that omits them.
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [kitSlug, callbackUrl, callbackSecret] = process.argv.slice(2);
if (!kitSlug) {
  console.error(
    "Usage: node scripts/create-kit-key.mjs <kit_slug> [callback_url] [callback_secret]",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY first.");
  process.exit(1);
}

const secret = randomBytes(32).toString("hex");
const secretHash = createHash("sha256").update(secret, "utf8").digest("hex");

const row = { kit_slug: kitSlug, secret_hash: secretHash };
if (callbackUrl) row.callback_url = callbackUrl;
if (callbackSecret) row.callback_secret = callbackSecret;

const supabase = createClient(url, secretKey, { db: { schema: "printkit" } });
const { error } = await supabase
  .from("kit_api_keys")
  .upsert(row, { onConflict: "kit_slug" });

if (error) {
  console.error("Failed to store key:", error.message);
  process.exit(1);
}

console.log(`Bearer token for ${kitSlug} (save this now, shown once):`);
console.log(`${kitSlug}:${secret}`);
