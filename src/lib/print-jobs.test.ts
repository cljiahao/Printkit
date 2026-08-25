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

const notifyKitPrintStatusMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/kit-callback", () => ({
  notifyKitPrintStatus: (...args: unknown[]) =>
    notifyKitPrintStatusMock(...args),
}));

const resolveActiveLocationMock = vi.fn();
const listActiveLocationsMock = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/print-locations", () => ({
  resolveActiveLocation: (...args: unknown[]) =>
    resolveActiveLocationMock(...args),
  listActiveLocations: (...args: unknown[]) => listActiveLocationsMock(...args),
}));

import { createPrintJob, updatePrintJobStatus } from "./print-jobs";

describe("createPrintJob", () => {
  beforeEach(() => {
    insertMock.mockReset();
    resolveActiveLocationMock.mockReset();
    listActiveLocationsMock.mockReset().mockResolvedValue([]);
  });

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
      location_id: null,
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

  it("returns a 400 result on an unknown vendor_id (foreign key violation)", async () => {
    insertMock.mockReturnValue({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: { code: "23503", message: "foreign key violation" },
          }),
      }),
    });

    const result = await createPrintJob({
      vendorId: "unknown-vendor",
      payload: { customer_name: "Ada", order_number: "0007" },
      sourceKit: "qkit",
      sourceRef: "order-uuid-1",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Unknown vendor_id.",
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

  it("resolves locationRef to location_id when an active location matches", async () => {
    resolveActiveLocationMock.mockResolvedValue({
      id: "loc-1",
      vendorId: "vendor-1",
    });
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
      locationRef: "booth-1",
    });

    expect(result).toEqual({ ok: true, id: "job-1" });
    expect(resolveActiveLocationMock).toHaveBeenCalledWith("qkit", "booth-1");
    expect(insertMock).toHaveBeenCalledWith({
      vendor_id: "vendor-1",
      job_type: "label",
      payload: { customer_name: "Ada", order_number: "0007" },
      source_kit: "qkit",
      source_ref: "order-uuid-1",
      location_id: "loc-1",
    });
  });

  it("creates the job with location_id null when locationRef doesn't resolve", async () => {
    resolveActiveLocationMock.mockResolvedValue(null);
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
      locationRef: "unknown-booth",
    });

    expect(result).toEqual({ ok: true, id: "job-1" });
    expect(insertMock).toHaveBeenCalledWith({
      vendor_id: "vendor-1",
      job_type: "label",
      payload: { customer_name: "Ada", order_number: "0007" },
      source_kit: "qkit",
      source_ref: "order-uuid-1",
      location_id: null,
    });
  });

  it("creates the job with location_id null when resolveActiveLocation throws", async () => {
    resolveActiveLocationMock.mockRejectedValue(new Error("network down"));
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
      locationRef: "booth-1",
    });

    expect(result).toEqual({ ok: true, id: "job-1" });
    expect(insertMock).toHaveBeenCalledWith({
      vendor_id: "vendor-1",
      job_type: "label",
      payload: { customer_name: "Ada", order_number: "0007" },
      source_kit: "qkit",
      source_ref: "order-uuid-1",
      location_id: null,
    });
  });

  it("creates the job with location_id null when locationRef is omitted", async () => {
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
    expect(resolveActiveLocationMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith({
      vendor_id: "vendor-1",
      job_type: "label",
      payload: { customer_name: "Ada", order_number: "0007" },
      source_kit: "qkit",
      source_ref: "order-uuid-1",
      location_id: null,
    });
  });

  it("passes an explicit jobType through identically to omitting it", async () => {
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
      jobType: "label",
    });

    expect(result).toEqual({ ok: true, id: "job-1" });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ job_type: "label" }),
    );
  });
});

describe("single-active-location auto-delivery fallback", () => {
  beforeEach(() => {
    insertMock.mockReset();
    resolveActiveLocationMock.mockReset();
    listActiveLocationsMock.mockReset().mockResolvedValue([]);
  });

  it("routes to the vendor's one active location when locationRef is omitted", async () => {
    listActiveLocationsMock.mockResolvedValue([
      { id: "loc-1", label: "Kopitiam Cart" },
    ]);
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
    expect(listActiveLocationsMock).toHaveBeenCalledWith("vendor-1");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ location_id: "loc-1" }),
    );
  });

  it("stays unrouted when the vendor has zero active locations", async () => {
    listActiveLocationsMock.mockResolvedValue([]);
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
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ location_id: null }),
    );
  });

  it("stays unrouted when the vendor has two or more active locations", async () => {
    listActiveLocationsMock.mockResolvedValue([
      { id: "loc-1", label: "Kopitiam Cart" },
      { id: "loc-2", label: "Ice Cream Cart" },
    ]);
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
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ location_id: null }),
    );
  });

  it("falls back to the vendor's one active location when locationRef doesn't resolve", async () => {
    resolveActiveLocationMock.mockResolvedValue(null);
    listActiveLocationsMock.mockResolvedValue([
      { id: "loc-1", label: "Kopitiam Cart" },
    ]);
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
      locationRef: "unknown-booth",
    });

    expect(result).toEqual({ ok: true, id: "job-1" });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ location_id: "loc-1" }),
    );
  });

  it("still creates the job with location_id null when listActiveLocations itself throws", async () => {
    listActiveLocationsMock.mockRejectedValue(new Error("network down"));
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
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ location_id: null }),
    );
  });
});

describe("resolveActiveLocation vendor-scoping", () => {
  beforeEach(() => {
    insertMock.mockReset();
    resolveActiveLocationMock.mockReset();
    listActiveLocationsMock.mockReset().mockResolvedValue([]);
  });

  it("treats a resolved location belonging to a different vendor as unresolved", async () => {
    resolveActiveLocationMock.mockResolvedValue({
      id: "loc-1",
      vendorId: "other-vendor",
    });
    // Zero other active locations for vendor-1 isolates this check from
    // the single-active-location fallback.
    listActiveLocationsMock.mockResolvedValue([]);
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
      locationRef: "booth-1",
    });

    expect(result).toEqual({ ok: true, id: "job-1" });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ location_id: null }),
    );
  });
});

describe("updatePrintJobStatus", () => {
  beforeEach(() => {
    notifyKitPrintStatusMock.mockClear();
    updateMock.mockReset();
  });

  it("updates the row and notifies the calling kit when status is failed", async () => {
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
    expect(notifyKitPrintStatusMock).toHaveBeenCalledWith(
      "qkit",
      "order-1",
      "failed",
    );
  });

  it("does not notify the calling kit for a non-terminal status (queued/sent)", async () => {
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

    expect(notifyKitPrintStatusMock).not.toHaveBeenCalled();
  });

  it("notifies whichever kit created the job, not just qkit", async () => {
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

    expect(notifyKitPrintStatusMock).toHaveBeenCalledWith(
      "some-other-kit",
      "ref-1",
      "failed",
    );
  });

  it("does not include printed_at in the update payload for a non-printed status", async () => {
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

    await updatePrintJobStatus("job-1", "failed");

    expect(updateMock).toHaveBeenCalledWith({ status: "failed" });
  });

  it("sets printed_at on a printed status", async () => {
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

    await updatePrintJobStatus("job-1", "printed");

    expect(updateMock).toHaveBeenCalledWith({
      status: "printed",
      printed_at: expect.any(String),
    });
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
    expect(notifyKitPrintStatusMock).not.toHaveBeenCalled();
  });
});
