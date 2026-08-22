import { describe, it, expect, vi, beforeEach } from "vitest";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const getVendorSessionMock = vi.fn();
vi.mock("@/lib/vendor-session", () => ({
  getVendorSession: () => getVendorSessionMock(),
}));

const updatePrintJobStatusMock = vi.fn();
vi.mock("@/lib/print-jobs", () => ({
  updatePrintJobStatus: (...args: unknown[]) =>
    updatePrintJobStatusMock(...args),
}));

const maybeSingleMock = vi.fn();
const sessionFromMock = vi.fn((table: string) => {
  if (table === "print_jobs") {
    return {
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      }),
    };
  }
  throw new Error(`unexpected table on session client: ${table}`);
});

const insertMock = vi.fn().mockResolvedValue({ error: null });
const serviceFromMock = vi.fn((table: string) => {
  if (table === "admin_audit") {
    return { insert: insertMock };
  }
  throw new Error(`unexpected table on service client: ${table}`);
});
const service = { from: serviceFromMock };

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => Promise.resolve(service),
}));

import { reprintJob } from "./actions";

describe("reprintJob", () => {
  beforeEach(() => {
    getVendorSessionMock.mockReset();
    updatePrintJobStatusMock.mockReset();
    maybeSingleMock.mockReset();
    insertMock.mockClear();
    sessionFromMock.mockClear();
    serviceFromMock.mockClear();
    revalidatePathMock.mockClear();
    getVendorSessionMock.mockResolvedValue({
      supabase: { from: sessionFromMock },
      user: { id: "vendor-1" },
    });
  });

  it("returns an error when the job doesn't belong to this vendor", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await reprintJob("job-1");

    expect(result).toEqual({ success: false, error: "Print job not found" });
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("returns an error when the job isn't currently failed", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { status: "printed" },
      error: null,
    });

    const result = await reprintJob("job-1");

    expect(result).toEqual({
      success: false,
      error: "Only a failed job can be reprinted",
    });
  });

  it("resets a failed job to queued and logs an admin_audit entry", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { status: "failed" },
      error: null,
    });
    updatePrintJobStatusMock.mockResolvedValue({ ok: true });

    const result = await reprintJob("job-1");

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith("job-1", "queued");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: "vendor-1",
        action: "manual_reprint_triggered",
        target_id: "job-1",
      }),
    );
    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/history");
  });

  it("does not revalidate when the job isn't found or isn't failed", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await reprintJob("job-1");

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
