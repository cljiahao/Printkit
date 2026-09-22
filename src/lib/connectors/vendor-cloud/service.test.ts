import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();
const queryJobMock = vi.fn();
const getVendorCloudDriverMock = vi.fn();
vi.mock("@/lib/connectors/vendor-cloud/drivers", () => ({
  getVendorCloudDriver: (...args: unknown[]) =>
    getVendorCloudDriverMock(...args),
}));

const updatePrintJobStatusMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/print-jobs", () => ({
  updatePrintJobStatus: (...args: unknown[]) =>
    updatePrintJobStatusMock(...args),
}));

const updateMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({ from: () => ({ update: updateMock }) }),
}));

import { sendVendorCloudJob, reconcileVendorCloudJob } from "./service";

const printer = {
  id: "printer-1",
  vendor_id: "vendor-1",
  location_id: "loc-1",
  catalog_id: "feie-fp-n20h",
  connector: "vendor_cloud",
  driver: "feie",
  display_name: "Feie FP-N20H",
  label_width_mm: 50,
  label_height_mm: 30,
  device_ref: "SN1",
  last_seen_at: null,
  created_at: "2026-09-20T00:00:00.000Z",
};

const job = {
  id: "job-1",
  payload: { customer_name: "Ada", order_number: "7" },
};

beforeEach(() => {
  sendMock.mockReset().mockResolvedValue({ ok: true, driverRef: "order-9" });
  queryJobMock.mockReset().mockResolvedValue("pending");
  getVendorCloudDriverMock.mockReset().mockReturnValue({
    id: "feie",
    send: sendMock,
    queryJob: queryJobMock,
  });
  updatePrintJobStatusMock.mockClear();
  updateMock.mockReset().mockReturnValue({
    eq: () => Promise.resolve({ error: null }),
  });
});

describe("sendVendorCloudJob", () => {
  it("sends the label at the printer's own size and records the maker's job id", async () => {
    await sendVendorCloudJob(job, printer);

    const [deviceRef, rendered] = sendMock.mock.calls[0];
    expect(deviceRef).toBe("SN1");
    expect(rendered.layout).toMatchObject({ widthMm: 50, heightMm: 30 });
    expect(updateMock).toHaveBeenCalledWith({ driver_ref: "order-9" });
  });

  it("fails the job when the maker rejects the send", async () => {
    sendMock.mockResolvedValue({ ok: false, error: "printer offline" });

    await sendVendorCloudJob(job, printer);

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-1",
      "failed",
      "driver_error",
    );
  });

  it("fails the job when the printer was never registered", async () => {
    await sendVendorCloudJob(job, { ...printer, device_ref: null });

    expect(sendMock).not.toHaveBeenCalled();
    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-1",
      "failed",
      "printer_offline",
    );
  });

  it("fails the job when no driver is built for the printer", async () => {
    getVendorCloudDriverMock.mockReturnValue(null);

    await sendVendorCloudJob(job, printer);

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-1",
      "failed",
      "driver_error",
    );
  });
});

describe("reconcileVendorCloudJob", () => {
  it("marks a job the maker says printed", async () => {
    queryJobMock.mockResolvedValue("printed");

    await reconcileVendorCloudJob(
      { id: "job-1", driver_ref: "order-9" },
      printer,
    );

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith("job-1", "printed");
  });

  it("leaves a job the maker is still holding", async () => {
    await reconcileVendorCloudJob(
      { id: "job-1", driver_ref: "order-9" },
      printer,
    );

    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("does nothing without a maker job id to ask about", async () => {
    await reconcileVendorCloudJob({ id: "job-1", driver_ref: null }, printer);

    expect(queryJobMock).not.toHaveBeenCalled();
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });
});
