#!/usr/bin/env node
// Generates a bearer secret for a new calling kit and stores its SHA-256 hash
// in paykit.kit_api_keys via the service-role client. Run once per kit. Prints
// the plaintext secret ONCE — save it in the calling kit's own secret store;
// paykit never stores or displays it again.
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const kitSlug = process.argv[2];
if (!kitSlug) {
  console.error("Usage: node scripts/create-kit-key.mjs <kit_slug>");
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

const supabase = createClient(url, secretKey, { db: { schema: "paykit" } });
const { error } = await supabase
  .from("kit_api_keys")
  .upsert(
    { kit_slug: kitSlug, secret_hash: secretHash },
    { onConflict: "kit_slug" },
  );

if (error) {
  console.error("Failed to store key:", error.message);
  process.exit(1);
}

console.log(`Bearer token for ${kitSlug} (save this now, shown once):`);
console.log(`${kitSlug}:${secret}`);
