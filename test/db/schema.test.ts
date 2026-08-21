import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sql = readFileSync(
  fileURLToPath(
    new URL("../../supabase/migrations/0001_paykit_core.sql", import.meta.url),
  ),
  "utf8",
);

describe("0001_paykit_core.sql", () => {
  it("creates the paykit schema", () => {
    expect(sql).toMatch(/create schema if not exists paykit/);
  });

  it.each(["vendor_payment_config", "transactions", "refunds", "kit_api_keys"])(
    "creates table paykit.%s",
    (table) => {
      expect(sql).toMatch(new RegExp(`create table paykit\\.${table}`));
    },
  );

  it.each(["vendor_payment_config", "transactions", "refunds", "kit_api_keys"])(
    "enables RLS on paykit.%s",
    (table) => {
      expect(sql).toMatch(
        new RegExp(`alter table paykit\\.${table} enable row level security`),
      );
    },
  );

  it("defines tx_count_this_month", () => {
    expect(sql).toMatch(/function paykit\.tx_count_this_month/);
  });

  it("never grants kit_api_keys to authenticated or anon", () => {
    expect(sql).not.toMatch(
      /grant[^;]*kit_api_keys[^;]*to (authenticated|anon)/i,
    );
  });
});
