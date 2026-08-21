import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn();
const updateMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: () => ({
        insert: insertMock,
        update: updateMock,
      }),
    }),
}));

const notifyQkitPrintStatusMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/qkit-client", () => ({
  notifyQkitPrintStatus: (...args: unknown[]) =>
    notifyQkitPrintStatusMock(...args),
}));

import { createPrintJob, updatePrintJobStatus } from "./print-jobs";

describe("createPrintJob", () => {
  beforeEach(() => insertMock.mockReset());

  it("inserts a queued print_jobs row and returns its id", async () => {
    insertMock.mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: "job-1" }, error: null }),
      }),
    });

    const result = await createPrintJob({
      vendorId: "vendor-1",
      payload: { customer_name: "Ada", order_number: "0007" },
      sourceKit: "qkit",
      sourceRef: "order-uuid-1",
    });

    expect(result).toEqual({ ok: true, id: "job-1" });
    expect(insertMock).toHaveBeenCalledWith({
      vendor_id: "vendor-1",
      job_type: "label",
      payload: { customer_name: "Ada", order_number: "0007" },
      source_kit: "qkit",
      source_ref: "order-uuid-1",
    });
  });

  it("returns a 409 conflict result on a duplicate (source_kit, source_ref)", async () => {
    insertMock.mockReturnValue({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: { code: "23505", message: "duplicate key value" },
          }),
      }),
    });

    const result = await createPrintJob({
      vendorId: "vendor-1",
      payload: { customer_name: "Ada", order_number: "0007" },
      sourceKit: "qkit",
      sourceRef: "order-uuid-1",
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "A print job already exists for this order.",
    });
  });

  it("returns a 500 result on an unexpected database error", async () => {
    insertMock.mockReturnValue({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: { code: "XXOOO", message: "connection reset" },
          }),
      }),
    });

    const result = await createPrintJob({
      vendorId: "vendor-1",
      payload: {},
      sourceKit: "qkit",
      sourceRef: "order-uuid-2",
    });

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "Could not create print job.",
    });
  });
});

describe("updatePrintJobStatus", () => {
  beforeEach(() => {
    notifyQkitPrintStatusMock.mockClear();
    updateMock.mockReset();
  });

  it("updates the row and notifies qkit when source_kit is qkit and status is failed", async () => {
    updateMock.mockReturnValue({
      eq: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: { source_kit: "qkit", source_ref: "order-1" },
              error: null,
            }),
        }),
      }),
    });

    const result = await updatePrintJobStatus("job-1", "failed");

    expect(result).toEqual({ ok: true });
    expect(notifyQkitPrintStatusMock).toHaveBeenCalledWith("order-1", "failed");
  });

  it("does not notify qkit for a non-terminal status (queued/sent)", async () => {
    updateMock.mockReturnValue({
      eq: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: { source_kit: "qkit", source_ref: "order-1" },
              error: null,
            }),
        }),
      }),
    });

    await updatePrintJobStatus("job-1", "sent");

    expect(notifyQkitPrintStatusMock).not.toHaveBeenCalled();
  });

  it("does not notify qkit when source_kit is not qkit", async () => {
    updateMock.mockReturnValue({
      eq: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: { source_kit: "some-other-kit", source_ref: "ref-1" },
              error: null,
            }),
        }),
      }),
    });

    await updatePrintJobStatus("job-1", "failed");

    expect(notifyQkitPrintStatusMock).not.toHaveBeenCalled();
  });

  it("returns ok:false when the row isn't found", async () => {
    updateMock.mockReturnValue({
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    });

    const result = await updatePrintJobStatus("missing-job", "failed");

    expect(result).toEqual({
      ok: false,
      error: "Could not update print job status.",
    });
    expect(notifyQkitPrintStatusMock).not.toHaveBeenCalled();
  });
});
