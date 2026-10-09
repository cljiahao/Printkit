import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  parseKeyOptions,
  readCallbackSecret,
} from "./create-kit-key-input.mjs";

try {
  const options = parseKeyOptions(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey)
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY first.",
    );
  const callbackSecret = options.readSecret
    ? await readCallbackSecret(process.stdin)
    : undefined;
  const secret = randomBytes(32).toString("hex");
  const row = {
    kit_slug: options.kitSlug,
    secret_hash: createHash("sha256").update(secret, "utf8").digest("hex"),
  };
  if (options.callbackUrl) {
    row.callback_url = options.callbackUrl;
    row.callback_secret = callbackSecret;
  }
  const supabase = createClient(url, secretKey, { db: { schema: "printkit" } });
  const { error } = await supabase
    .from("kit_api_keys")
    .upsert(row, { onConflict: "kit_slug" });
  if (error) throw new Error("Failed to store key.");
  console.log(
    `Bearer token for ${options.kitSlug} (save this now, shown once):`,
  );
  console.log(`${options.kitSlug}:${secret}`);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Key creation failed.",
  );
  process.exitCode = 1;
}
