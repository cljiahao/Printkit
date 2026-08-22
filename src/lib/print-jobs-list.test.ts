import { describe, it, expect, vi } from "vitest";
import { listPrintJobs } from "./print-jobs-list";

describe("listPrintJobs", () => {
  it("selects the vendor's own rows ordered newest-first, respecting the limit", async () => {
    const rows = [{ id: "job-2" }, { id: "job-1" }];
    const limitMock = vi.fn().mockResolvedValue({ data: rows, error: null });
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const supabase = { from: () => ({ select: selectMock }) } as never;

    const result = await listPrintJobs(supabase, "vendor-1", 5);

    expect(selectMock).toHaveBeenCalledWith("*");
    expect(eqMock).toHaveBeenCalledWith("vendor_id", "vendor-1");
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(5);
    expect(result).toEqual(rows);
  });

  it("returns an empty array on a query error rather than throwing", async () => {
    const limitMock = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ order: () => ({ limit: limitMock }) }) }),
      }),
    } as never;

    const result = await listPrintJobs(supabase, "vendor-1");
    expect(result).toEqual([]);
  });
});
