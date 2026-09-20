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

const sendVendorCloudJobMock = vi.fn().mockResolvedValue(undefined);
const reconcileVendorCloudJobMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/connectors/vendor-cloud/service", () => ({
  sendVendorCloudJob: (...args: unknown[]) => sendVendorCloudJobMock(...args),
  reconcileVendorCloudJob: (...args: unknown[]) =>
    reconcileVendorCloudJobMock(...args),
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

function jobRowReturns(row: unknown, sweepRows: unknown[] = []) {
  selectMock.mockReturnValue({
    eq: () => ({
      maybeSingle: () => Promise.resolve({ data: row, error: null }),
      in: () => Promise.resolve({ data: sweepRows, error: null }),
    }),
  });
}

beforeEach(() => {
  rpcMock.mockReset();
  selectMock.mockReset();
  updatePrintJobStatusMock.mockClear();
  getPrinterByLocationMock.mockReset().mockResolvedValue(null);
  sendVendorCloudJobMock.mockClear();
  reconcileVendorCloudJobMock.mockClear();
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

  it("claims a push-connector job before sending it", async () => {
    jobRowReturns({ ...job, status: "queued" });
    getPrinterByLocationMock.mockResolvedValue({
      connector: "vendor_cloud",
      driver: "feie",
      device_ref: "SN1",
    });
    rpcMock.mockResolvedValue({
      data: [{ id: "job-1", payload: { order_number: "7" } }],
      error: null,
    });

    await dispatchJob("job-1");

    expect(rpcMock).toHaveBeenCalledWith("claim_job", {
      p_location_id: "loc-1",
      p_job_id: "job-1",
    });
    expect(sendVendorCloudJobMock).toHaveBeenCalledWith(
      { id: "job-1", payload: { order_number: "7" } },
      expect.objectContaining({ driver: "feie" }),
    );
  });

  it("sends nothing when the job was already claimed", async () => {
    jobRowReturns({ ...job, status: "queued" });
    getPrinterByLocationMock.mockResolvedValue({
      connector: "vendor_cloud",
      driver: "feie",
      device_ref: "SN1",
    });
    rpcMock.mockResolvedValue({ data: [], error: null });

    await dispatchJob("job-1");

    expect(sendVendorCloudJobMock).not.toHaveBeenCalled();
  });
});

describe("sweepLocation: push connectors", () => {
  const vendorCloudPrinter = {
    connector: "vendor_cloud",
    driver: "feie",
    device_ref: "SN1",
  };

  it("asks the maker about a sent job before giving up on it", async () => {
    const sent = new Date(Date.now() - 90_000).toISOString();
    sweepReturns([
      {
        id: "job-sent",
        status: "sent",
        created_at: sent,
        requeued_at: null,
        sent_at: sent,
        driver_ref: "order-9",
      },
    ]);
    getPrinterByLocationMock.mockResolvedValue(vendorCloudPrinter);

    await sweepLocation("loc-1");

    expect(reconcileVendorCloudJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-sent", driver_ref: "order-9" }),
      vendorCloudPrinter,
    );
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("gives a pushed job five minutes, not two, before failing it", async () => {
    const threeMinutes = new Date(Date.now() - 3 * 60_000).toISOString();
    sweepReturns([
      {
        id: "job-sent",
        status: "sent",
        created_at: threeMinutes,
        requeued_at: null,
        sent_at: threeMinutes,
        driver_ref: null,
      },
    ]);
    getPrinterByLocationMock.mockResolvedValue(vendorCloudPrinter);

    await sweepLocation("loc-1");

    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("fails a pushed job the maker never resolved", async () => {
    const old = new Date(Date.now() - 6 * 60_000).toISOString();
    sweepReturns([
      {
        id: "job-sent",
        status: "sent",
        created_at: old,
        requeued_at: null,
        sent_at: old,
        driver_ref: null,
      },
    ]);
    getPrinterByLocationMock.mockResolvedValue(vendorCloudPrinter);

    await sweepLocation("loc-1");

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-sent",
      "failed",
      "driver_error",
    );
  });
});
