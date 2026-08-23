import { describe, it, expect, vi } from "vitest";

const verifyKitAuth = vi.fn();
const createOrUpdatePrintLocation = vi.fn();
vi.mock("@/lib/kit-auth", () => ({
  verifyKitAuth: (...a: unknown[]) => verifyKitAuth(...a),
}));
vi.mock("@/lib/print-locations", () => ({
  createOrUpdatePrintLocation: (...a: unknown[]) =>
    createOrUpdatePrintLocation(...a),
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/v1/print-locations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/print-locations", () => {
  it("returns 401 when the bearer secret doesn't verify", async () => {
    verifyKitAuth.mockResolvedValue(null);
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 on an invalid body", async () => {
    verifyKitAuth.mockResolvedValue({ kitSlug: "qkit" });
    const res = await POST(req({ vendor_id: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("upserts and returns 201 with the location id", async () => {
    verifyKitAuth.mockResolvedValue({ kitSlug: "qkit" });
    createOrUpdatePrintLocation.mockResolvedValue({ ok: true, id: "loc-1" });

    const res = await POST(
      req({
        vendor_id: "11111111-1111-1111-1111-111111111111",
        source_ref: "booth-1",
        label: "Kopitiam Cart",
        active: true,
      }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "loc-1" });
    expect(createOrUpdatePrintLocation).toHaveBeenCalledWith({
      vendorId: "11111111-1111-1111-1111-111111111111",
      sourceKit: "qkit",
      sourceRef: "booth-1",
      label: "Kopitiam Cart",
      active: true,
    });
  });
});
