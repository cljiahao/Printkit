import { describe, it, expect, vi } from "vitest";
import { listPrintJobs, countUnroutedJobs } from "./print-jobs-list";

const { createServerClientMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: createServerClientMock,
}));

describe("listPrintJobs", () => {
  it("selects the vendor's own rows ordered newest-first, respecting the limit", async () => {
    const rows = [{ id: "job-2" }, { id: "job-1" }];
    const limitMock = vi.fn().mockResolvedValue({ data: rows, error: null });
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const supabase = { from: () => ({ select: selectMock }) } as never;

    const result = await listPrintJobs(supabase, "vendor-1", 5);

    expect(selectMock).toHaveBeenCalledWith("*, print_locations(label)");
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

describe("countUnroutedJobs", () => {
  it("counts the vendor's queued jobs with no location assigned", async () => {
    const eqStatusMock = vi.fn().mockResolvedValue({ count: 3, error: null });
    const isMock = vi.fn().mockReturnValue({ eq: eqStatusMock });
    const eqVendorMock = vi.fn().mockReturnValue({ is: isMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqVendorMock });
    createServerClientMock.mockResolvedValue({
      from: () => ({ select: selectMock }),
    });

    const result = await countUnroutedJobs("vendor-1");

    expect(selectMock).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    expect(eqVendorMock).toHaveBeenCalledWith("vendor_id", "vendor-1");
    expect(isMock).toHaveBeenCalledWith("location_id", null);
    expect(eqStatusMock).toHaveBeenCalledWith("status", "queued");
    expect(result).toBe(3);
  });

  it("returns 0 on a query error rather than throwing", async () => {
    createServerClientMock.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              eq: () =>
                Promise.resolve({ count: null, error: { message: "boom" } }),
            }),
          }),
        }),
      }),
    });

    const result = await countUnroutedJobs("vendor-1");
    expect(result).toBe(0);
  });
});
