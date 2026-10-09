import { describe, expect, it, vi } from "vitest";
import { decodeHistoryCursor, listPrintHistoryPage } from "./print-history";

const rows = Array.from({ length: 51 }, (_, index) => ({
  id: "00000000-0000-4000-8000-" + String(100 - index).padStart(12, "0"),
  created_at: "2026-10-08T12:00:00Z",
}));
function client(pages: unknown[]) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  for (const name of ["select", "eq", "is", "or", "order"] as const)
    chain[name].mockReturnValue(chain);
  for (const data of pages)
    chain.limit.mockResolvedValueOnce({ data, error: null });
  chain.limit.mockResolvedValue({ data: [], error: null });
  return { chain, supabase: { from: () => chain } as never };
}
describe("print history pagination", () => {
  it("collects capped batches and carries a stable tie-breaking cursor", async () => {
    const { chain, supabase } = client([
      rows.slice(0, 20),
      rows.slice(20, 40),
      rows.slice(40),
    ]);
    const result = await listPrintHistoryPage(supabase, "vendor");
    expect(result.jobs).toHaveLength(50);
    expect(decodeHistoryCursor(result.nextCursor!)).toEqual({
      createdAt: rows[49].created_at,
      id: rows[49].id,
    });
    expect(chain.order).toHaveBeenCalledWith("id", { ascending: false });
    expect(chain.or.mock.calls[0][0]).toContain(rows[19].id);
  });
  it("filters unrouted jobs before any page limit and continues until empty", async () => {
    const { chain, supabase } = client([rows.slice(0, 2)]);
    expect(
      (await listPrintHistoryPage(supabase, "vendor", { unrouted: true }))
        .nextCursor,
    ).toBeNull();
    expect(chain.is).toHaveBeenCalledWith("location_id", null);
    expect(chain.eq).toHaveBeenCalledWith("status", "queued");
    expect(chain.limit).toHaveBeenCalledTimes(2);
  });
  it("propagates query failures instead of presenting empty history", async () => {
    const { chain, supabase } = client([]);
    chain.limit.mockResolvedValue({
      data: null,
      error: { message: "offline" },
    });
    await expect(listPrintHistoryPage(supabase, "vendor")).rejects.toThrow(
      "Could not load",
    );
  });
  it("rejects malformed or injection-bearing cursors before querying", async () => {
    const { chain, supabase } = client([]);
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: "2026-10-08T12:00:00Z),status.eq.sent",
        id: rows[0].id,
      }),
    ).toString("base64url");
    await expect(
      listPrintHistoryPage(supabase, "vendor", { cursor }),
    ).rejects.toThrow("Invalid history cursor");
    expect(chain.select).not.toHaveBeenCalled();
  });
  it("rejects a repeated page instead of looping indefinitely", async () => {
    const { supabase } = client([rows.slice(0, 1), rows.slice(0, 1)]);
    await expect(listPrintHistoryPage(supabase, "vendor")).rejects.toThrow(
      "did not advance",
    );
  });
});

it("starts strictly after a supplied cursor and handles an empty final page", async () => {
  const { chain, supabase } = client([]);
  const cursor = Buffer.from(
    JSON.stringify({ createdAt: rows[0].created_at, id: rows[0].id }),
  ).toString("base64url");
  expect(await listPrintHistoryPage(supabase, "vendor", { cursor })).toEqual({
    jobs: [],
    nextCursor: null,
  });
  expect(chain.or).toHaveBeenCalledWith(
    "created_at.lt." +
      rows[0].created_at +
      ",and(created_at.eq." +
      rows[0].created_at +
      ",id.lt." +
      rows[0].id +
      ")",
  );
});

it.each(["%%%", "x".repeat(513), Buffer.from("{}").toString("base64url")])(
  "rejects invalid cursor %s",
  (cursor) => {
    expect(() => decodeHistoryCursor(cursor)).toThrow("Invalid history cursor");
  },
);
