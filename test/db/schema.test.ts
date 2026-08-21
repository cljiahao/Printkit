import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/0001_printkit_core.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("0001_printkit_core.sql", () => {
  it("creates the printkit schema", () => {
    expect(sql).toMatch(/create schema if not exists printkit/);
  });

  it.each(["print_jobs", "kit_api_keys"])(
    "creates table printkit.%s",
    (table) => {
      expect(sql).toMatch(new RegExp(`create table printkit\\.${table}`));
    },
  );

  it.each(["print_jobs", "kit_api_keys"])(
    "enables RLS on printkit.%s",
    (table) => {
      expect(sql).toMatch(
        new RegExp(
          `alter table printkit\\.${table}\\s+enable row level security`,
        ),
      );
    },
  );

  it("never grants kit_api_keys to authenticated or anon", () => {
    expect(sql).not.toMatch(
      /grant[^;]*kit_api_keys[^;]*to (authenticated|anon)/i,
    );
  });
});
