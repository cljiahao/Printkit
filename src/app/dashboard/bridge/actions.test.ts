import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { reportPrintResult, logBridgeEvent } from "./actions";

describe("reportPrintResult", () => {
  beforeEach(() => {
    updatePrintJobStatusMock.mockReset();
    maybeSingleMock.mockReset();
    sessionFromMock.mockClear();
    getVendorSessionMock.mockReset();
    getVendorSessionMock.mockResolvedValue({
      supabase: { from: sessionFromMock },
      user: { id: "vendor-1" },
    });
  });

  it("marks the job printed on success", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "job-1" }, error: null });
    updatePrintJobStatusMock.mockResolvedValue({ ok: true });

    const result = await reportPrintResult("job-1", "printed");

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith("job-1", "printed");
    expect(result).toEqual({ success: true });
  });

  it("marks the job failed and surfaces the error", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "job-1" }, error: null });
    updatePrintJobStatusMock.mockResolvedValue({
      ok: false,
      error: "Could not update print job status.",
    });

    const result = await reportPrintResult("job-1", "failed");

    expect(result).toEqual({
      success: false,
      error: "Could not update print job status.",
    });
  });

  it("refuses to update a job that doesn't belong to the calling vendor", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await reportPrintResult("someone-elses-job", "printed");

    expect(result).toEqual({ success: false, error: "Print job not found" });
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("scopes the ownership check to the calling vendor's id", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await reportPrintResult("job-1", "printed");

    expect(sessionFromMock).toHaveBeenCalledWith("print_jobs");
  });
});

describe("logBridgeEvent", () => {
  beforeEach(() => {
    insertMock.mockClear();
    insertMock.mockResolvedValue({ error: null });
    serviceFromMock.mockClear();
    getVendorSessionMock.mockReset();
    getVendorSessionMock.mockResolvedValue({
      supabase: { from: sessionFromMock },
      user: { id: "vendor-1" },
    });
  });

  it("inserts an admin_audit row for the given action", async () => {
    const result = await logBridgeEvent("printer_paired");

    expect(insertMock).toHaveBeenCalledWith({
      admin_id: "vendor-1",
      action: "printer_paired",
      target_id: null,
      detail: null,
    });
    expect(result).toEqual({ success: true });
  });

  it("passes through an optional detail payload", async () => {
    await logBridgeEvent("bridge_disconnected", { reason: "manual" });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "bridge_disconnected",
        detail: { reason: "manual" },
      }),
    );
  });

  it("surfaces an error when the insert fails", async () => {
    insertMock.mockResolvedValue({ error: { message: "boom" } });

    const result = await logBridgeEvent("printer_paired");

    expect(result).toEqual({ success: false, error: "Could not log event." });
  });
});
