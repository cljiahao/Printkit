import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyKitAuthMock = vi.fn();
const createPrintJobMock = vi.fn();

vi.mock("@/lib/kit-auth", () => ({
  verifyKitAuth: (...args: unknown[]) => verifyKitAuthMock(...args),
}));
vi.mock("@/lib/print-jobs", () => ({
  createPrintJob: (...args: unknown[]) => createPrintJobMock(...args),
}));

import { POST } from "./route";

function requestWith(body: unknown, authorization = "Bearer qkit:secret") {
  return new Request("https://printkit.test/api/v1/print-jobs", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/print-jobs", () => {
  beforeEach(() => {
    verifyKitAuthMock.mockReset();
    createPrintJobMock.mockReset();
  });

  it("returns 401 when the bearer secret doesn't verify", async () => {
    verifyKitAuthMock.mockResolvedValue(null);

    const res = await POST(requestWith({}));

    expect(res.status).toBe(401);
    expect(createPrintJobMock).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid request body", async () => {
    verifyKitAuthMock.mockResolvedValue({ kitSlug: "qkit" });

    const res = await POST(requestWith({ vendor_id: "not-a-uuid" }));

    expect(res.status).toBe(400);
    expect(createPrintJobMock).not.toHaveBeenCalled();
  });

  it("creates a print job and returns 201 with its id", async () => {
    verifyKitAuthMock.mockResolvedValue({ kitSlug: "qkit" });
    createPrintJobMock.mockResolvedValue({ ok: true, id: "job-1" });

    const res = await POST(
      requestWith({
        vendor_id: "11111111-1111-1111-1111-111111111111",
        payload: { customer_name: "Ada", order_number: "0007" },
        source_ref: "order-uuid-1",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ id: "job-1" });
    expect(createPrintJobMock).toHaveBeenCalledWith({
      vendorId: "11111111-1111-1111-1111-111111111111",
      payload: { customer_name: "Ada", order_number: "0007" },
      sourceKit: "qkit",
      sourceRef: "order-uuid-1",
    });
  });

  it("passes location_ref through to createPrintJob as locationRef", async () => {
    verifyKitAuthMock.mockResolvedValue({ kitSlug: "qkit" });
    createPrintJobMock.mockResolvedValue({ ok: true, id: "job-1" });

    const res = await POST(
      requestWith({
        vendor_id: "11111111-1111-1111-1111-111111111111",
        payload: { customer_name: "Ada", order_number: "0007" },
        source_ref: "order-uuid-1",
        location_ref: "booth-1",
      }),
    );

    expect(res.status).toBe(201);
    expect(createPrintJobMock).toHaveBeenCalledWith({
      vendorId: "11111111-1111-1111-1111-111111111111",
      payload: { customer_name: "Ada", order_number: "0007" },
      sourceKit: "qkit",
      sourceRef: "order-uuid-1",
      locationRef: "booth-1",
    });
  });

  it("creates a print job when location_ref is omitted (backward compatibility)", async () => {
    verifyKitAuthMock.mockResolvedValue({ kitSlug: "qkit" });
    createPrintJobMock.mockResolvedValue({ ok: true, id: "job-1" });

    const res = await POST(
      requestWith({
        vendor_id: "11111111-1111-1111-1111-111111111111",
        payload: { customer_name: "Ada", order_number: "0007" },
        source_ref: "order-uuid-1",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ id: "job-1" });
    expect(createPrintJobMock).toHaveBeenCalledWith({
      vendorId: "11111111-1111-1111-1111-111111111111",
      payload: { customer_name: "Ada", order_number: "0007" },
      sourceKit: "qkit",
      sourceRef: "order-uuid-1",
      locationRef: undefined,
    });
  });

  it("passes job_type through to createPrintJob as jobType", async () => {
    verifyKitAuthMock.mockResolvedValue({ kitSlug: "qkit" });
    createPrintJobMock.mockResolvedValue({ ok: true, id: "job-1" });

    const res = await POST(
      requestWith({
        vendor_id: "11111111-1111-1111-1111-111111111111",
        payload: { customer_name: "Ada", order_number: "0007" },
        source_ref: "order-uuid-1",
        job_type: "label",
      }),
    );

    expect(res.status).toBe(201);
    expect(createPrintJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: "label" }),
    );
  });

  it("returns the createPrintJob error status/message on failure (e.g. 409 duplicate)", async () => {
    verifyKitAuthMock.mockResolvedValue({ kitSlug: "qkit" });
    createPrintJobMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "A print job already exists for this order.",
    });

    const res = await POST(
      requestWith({
        vendor_id: "11111111-1111-1111-1111-111111111111",
        payload: {},
        source_ref: "order-uuid-1",
      }),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({
      error: "A print job already exists for this order.",
    });
  });
});
