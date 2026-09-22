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
const locationMaybeSingleMock = vi.fn();
const serviceFromMock = vi.fn((table: string) => {
  if (table === "admin_audit") {
    return { insert: insertMock };
  }
  if (table === "print_locations") {
    return {
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: locationMaybeSingleMock }) }),
      }),
    };
  }
  throw new Error(`unexpected table on service client: ${table}`);
});
const service = { from: serviceFromMock };

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => Promise.resolve(service),
}));

const claimJobMock = vi.fn();
const sweepLocationMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/job-dispatch", () => ({
  claimJob: (...args: unknown[]) => claimJobMock(...args),
  sweepLocation: (...args: unknown[]) => sweepLocationMock(...args),
}));

const createPrinterMock = vi.fn();
const getPrinterByLocationMock = vi.fn();
const touchPrinterSeenMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/printers", () => ({
  createPrinter: (...args: unknown[]) => createPrinterMock(...args),
  getPrinterByLocation: (...args: unknown[]) =>
    getPrinterByLocationMock(...args),
  touchPrinterSeen: (...args: unknown[]) => touchPrinterSeenMock(...args),
}));

import {
  reportPrintResult,
  logBridgeEvent,
  claimBridgeJob,
  bridgeHeartbeat,
  ensureBridgePrinter,
} from "./actions";

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

describe("bridge job claiming and health", () => {
  beforeEach(() => {
    getVendorSessionMock.mockReset().mockResolvedValue({
      supabase: { from: sessionFromMock },
      user: { id: "vendor-1" },
    });
    locationMaybeSingleMock.mockReset().mockResolvedValue({
      data: { id: "loc-1" },
      error: null,
    });
    claimJobMock.mockReset();
    sweepLocationMock.mockClear();
    createPrinterMock.mockReset();
    getPrinterByLocationMock.mockReset();
    touchPrinterSeenMock.mockClear();
  });

  it("claims a job before the bridge prints it", async () => {
    claimJobMock.mockResolvedValue({ id: "job-1" });

    expect(await claimBridgeJob("loc-1", "job-1")).toEqual({
      ok: true,
      jobId: "job-1",
    });
    expect(claimJobMock).toHaveBeenCalledWith("loc-1", "job-1");
  });

  it("reports nothing to print when the job was already claimed", async () => {
    claimJobMock.mockResolvedValue(null);
    expect(await claimBridgeJob("loc-1", "job-1")).toEqual({ ok: false });
  });

  it("refuses to claim at a booth the vendor does not own", async () => {
    locationMaybeSingleMock.mockResolvedValue({ data: null, error: null });

    expect(await claimBridgeJob("loc-9", "job-1")).toEqual({ ok: false });
    expect(claimJobMock).not.toHaveBeenCalled();
  });

  it("sweeps the booth and records the printer as seen on a heartbeat", async () => {
    getPrinterByLocationMock.mockResolvedValue({ id: "printer-1" });

    await bridgeHeartbeat("loc-1");

    expect(sweepLocationMock).toHaveBeenCalledWith("loc-1");
    expect(touchPrinterSeenMock).toHaveBeenCalledWith({ id: "printer-1" });
  });

  it("ignores a heartbeat for a booth the vendor does not own", async () => {
    locationMaybeSingleMock.mockResolvedValue({ data: null, error: null });

    await bridgeHeartbeat("loc-9");

    expect(sweepLocationMock).not.toHaveBeenCalled();
  });

  it("creates the Bluetooth printer row once", async () => {
    getPrinterByLocationMock.mockResolvedValue(null);

    await ensureBridgePrinter("loc-1");

    expect(createPrinterMock).toHaveBeenCalledWith({
      vendorId: "vendor-1",
      locationId: "loc-1",
      catalogId: "niimbot-b1",
    });
  });

  it("reuses the printer row on a later pairing", async () => {
    getPrinterByLocationMock.mockResolvedValue({ id: "printer-1" });

    await ensureBridgePrinter("loc-1");

    expect(createPrinterMock).not.toHaveBeenCalled();
  });
});
