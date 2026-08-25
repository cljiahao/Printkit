import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/0006_kit_api_keys_callback.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("0006_kit_api_keys_callback.sql", () => {
  it.each(["callback_url", "callback_secret"])(
    "adds nullable column %s to kit_api_keys",
    (column) => {
      expect(sql).toMatch(new RegExp(`add column ${column} text`));
    },
  );

  it("never grants kit_api_keys to authenticated or anon", () => {
    expect(sql).not.toMatch(
      /grant[^;]*kit_api_keys[^;]*to (authenticated|anon)/i,
    );
  });
});
