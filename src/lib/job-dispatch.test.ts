import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const selectMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      rpc: rpcMock,
      from: () => ({ select: selectMock }),
    }),
}));

const updatePrintJobStatusMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/print-jobs", () => ({
  updatePrintJobStatus: (...args: unknown[]) =>
    updatePrintJobStatusMock(...args),
}));

const getPrinterByLocationMock = vi.fn();
vi.mock("@/lib/printers", () => ({
  getPrinterByLocation: (...args: unknown[]) =>
    getPrinterByLocationMock(...args),
}));

import { claimJob, sweepLocation, dispatchJob } from "./job-dispatch";

const job = {
  id: "job-1",
  location_id: "loc-1",
  status: "sent",
  vendor_id: "vendor-1",
};

function sweepReturns(rows: unknown[]) {
  selectMock.mockReturnValue({
    eq: () => ({ in: () => Promise.resolve({ data: rows, error: null }) }),
  });
}

function jobRowReturns(row: unknown) {
  selectMock.mockReturnValue({
    eq: () => ({
      maybeSingle: () => Promise.resolve({ data: row, error: null }),
    }),
  });
}

beforeEach(() => {
  rpcMock.mockReset();
  selectMock.mockReset();
  updatePrintJobStatusMock.mockClear();
  getPrinterByLocationMock.mockReset();
});

describe("claimJob", () => {
  it("returns the claimed job", async () => {
    rpcMock.mockResolvedValue({ data: [job], error: null });

    expect(await claimJob("loc-1")).toEqual(job);
    expect(rpcMock).toHaveBeenCalledWith("claim_job", {
      p_location_id: "loc-1",
      p_job_id: null,
    });
  });

  it("passes a specific job id through", async () => {
    rpcMock.mockResolvedValue({ data: [job], error: null });

    await claimJob("loc-1", "job-1");
    expect(rpcMock).toHaveBeenCalledWith("claim_job", {
      p_location_id: "loc-1",
      p_job_id: "job-1",
    });
  });

  it("returns null when nothing was claimable", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    expect(await claimJob("loc-1")).toBeNull();
  });

  it("returns null and does not throw on a DB error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await claimJob("loc-1")).toBeNull();
  });
});

describe("sweepLocation", () => {
  it("fails jobs that outlived the expiry window", async () => {
    const old = new Date(Date.now() - 31 * 60_000).toISOString();
    sweepReturns([
      {
        id: "job-old",
        status: "queued",
        created_at: old,
        requeued_at: null,
        sent_at: null,
      },
    ]);

    await sweepLocation("loc-1");

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-old",
      "failed",
      "expired",
    );
  });

  it("measures expiry from requeued_at when a job was reprinted", async () => {
    const old = new Date(Date.now() - 31 * 60_000).toISOString();
    sweepReturns([
      {
        id: "job-reprinted",
        status: "queued",
        created_at: old,
        requeued_at: new Date().toISOString(),
        sent_at: null,
      },
    ]);

    await sweepLocation("loc-1");
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("fails sent jobs that were never confirmed", async () => {
    const sent = new Date(Date.now() - 3 * 60_000).toISOString();
    sweepReturns([
      {
        id: "job-stuck",
        status: "sent",
        created_at: sent,
        requeued_at: null,
        sent_at: sent,
      },
    ]);

    await sweepLocation("loc-1");

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-stuck",
      "failed",
      "device_reported_error",
    );
  });

  it("leaves fresh jobs alone", async () => {
    const fresh = new Date().toISOString();
    sweepReturns([
      {
        id: "job-new",
        status: "queued",
        created_at: fresh,
        requeued_at: null,
        sent_at: null,
      },
    ]);

    await sweepLocation("loc-1");
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("does not throw on a query error", async () => {
    selectMock.mockReturnValue({
      eq: () => ({
        in: () => Promise.resolve({ data: null, error: { message: "boom" } }),
      }),
    });

    await expect(sweepLocation("loc-1")).resolves.toBeUndefined();
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });
});

describe("dispatchJob", () => {
  it("does nothing for a pull connector", async () => {
    jobRowReturns({ ...job, status: "queued" });
    getPrinterByLocationMock.mockResolvedValue({
      connector: "cloud_poll",
      driver: "star-cloudprnt",
    });

    await dispatchJob("job-1");
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("does nothing when the job has no location yet", async () => {
    jobRowReturns({ ...job, location_id: null, status: "queued" });

    await dispatchJob("job-1");
    expect(getPrinterByLocationMock).not.toHaveBeenCalled();
  });

  it("does nothing when the location has no printer", async () => {
    jobRowReturns({ ...job, status: "queued" });
    getPrinterByLocationMock.mockResolvedValue(null);

    await expect(dispatchJob("job-1")).resolves.toBeUndefined();
  });

  it("does not throw when the job row is missing", async () => {
    jobRowReturns(null);
    await expect(dispatchJob("job-1")).resolves.toBeUndefined();
  });
});
