import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Cheap guard against silent drift in the hand-written 0002 migration — regex
// presence checks only, not a substitute for running it against real Postgres
// (see supabase/tests/rls.test.sql / CI's pgTAP `db` job for that).
const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/0002_printkit_admin.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("0002_printkit_admin.sql", () => {
  it.each(["admins", "admin_audit"])("creates table printkit.%s", (table) => {
    expect(sql).toMatch(new RegExp(`create table printkit\\.${table}\\b`));
  });

  it("defines the is_admin membership function", () => {
    expect(sql).toMatch(/create or replace function printkit\.is_admin\(/);
  });

  it("pins the is_admin search_path", () => {
    expect(sql).toMatch(/security definer stable set search_path = ''/);
  });

  it.each(["admins", "admin_audit"])(
    "enables row level security on printkit.%s",
    (table) => {
      expect(sql).toMatch(
        new RegExp(
          `alter table printkit\\.${table}\\s+enable row level security`,
        ),
      );
    },
  );

  it("grants the service role full access to admins table", () => {
    expect(sql).toMatch(/grant all on printkit\.admins to service_role/);
  });

  it("grants the service role select and insert on admin_audit", () => {
    expect(sql).toMatch(
      /grant select, insert on printkit\.admin_audit to service_role/,
    );
  });

  it("grants execute on is_admin to anon, authenticated, and service_role", () => {
    expect(sql).toMatch(
      /grant execute on function printkit\.is_admin\(uuid\) to anon, authenticated, service_role/,
    );
  });
});
