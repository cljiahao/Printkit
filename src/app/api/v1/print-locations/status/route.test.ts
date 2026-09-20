import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyKitAuthMock = vi.fn();
vi.mock("@/lib/kit-auth", () => ({
  verifyKitAuth: (...args: unknown[]) => verifyKitAuthMock(...args),
}));

const resolveActiveLocationMock = vi.fn();
vi.mock("@/lib/print-locations", () => ({
  resolveActiveLocation: (...args: unknown[]) =>
    resolveActiveLocationMock(...args),
}));

const getPrinterByLocationMock = vi.fn();
vi.mock("@/lib/printers", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/printers")>("@/lib/printers");
  return {
    ...actual,
    getPrinterByLocation: (...args: unknown[]) =>
      getPrinterByLocationMock(...args),
  };
});

const sweepLocationMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/job-dispatch", () => ({
  sweepLocation: (...args: unknown[]) => sweepLocationMock(...args),
}));

import { GET } from "./route";

function request(ref = "booth-1"): Request {
  return new Request(
    `https://printkit.test/api/v1/print-locations/status?source_ref=${ref}`,
  );
}

beforeEach(() => {
  verifyKitAuthMock.mockReset().mockResolvedValue({ kitSlug: "qkit" });
  resolveActiveLocationMock.mockReset();
  getPrinterByLocationMock.mockReset();
  sweepLocationMock.mockClear();
});

describe("GET /api/v1/print-locations/status", () => {
  it("rejects an unauthenticated caller", async () => {
    verifyKitAuthMock.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(resolveActiveLocationMock).not.toHaveBeenCalled();
  });

  it("rejects a missing source_ref", async () => {
    const res = await GET(
      new Request("https://printkit.test/api/v1/print-locations/status"),
    );
    expect(res.status).toBe(400);
  });

  it("returns a null printer for an unknown location", async () => {
    resolveActiveLocationMock.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ printer: null });
  });

  it("returns a null printer when the location has none", async () => {
    resolveActiveLocationMock.mockResolvedValue({
      id: "loc-1",
      vendorId: "vendor-1",
    });
    getPrinterByLocationMock.mockResolvedValue(null);
    expect(await (await GET(request())).json()).toEqual({ printer: null });
  });

  it("reports the printer and its live state", async () => {
    resolveActiveLocationMock.mockResolvedValue({
      id: "loc-1",
      vendorId: "vendor-1",
    });
    getPrinterByLocationMock.mockResolvedValue({
      id: "printer-1",
      display_name: "Feie FP-N20H",
      catalog_id: "feie-fp-n20h",
      connector: "vendor_cloud",
      last_seen_at: new Date().toISOString(),
    });

    const body = await (await GET(request())).json();
    expect(body.printer).toMatchObject({
      display_name: "Feie FP-N20H",
      catalog_id: "feie-fp-n20h",
      connector: "vendor_cloud",
      state: "online",
      hardware_verified: false,
    });
    expect(sweepLocationMock).toHaveBeenCalledWith("loc-1");
  });

  it("reports offline for a printer that has gone quiet", async () => {
    resolveActiveLocationMock.mockResolvedValue({
      id: "loc-1",
      vendorId: "vendor-1",
    });
    getPrinterByLocationMock.mockResolvedValue({
      id: "printer-1",
      display_name: "Star mC-Label2",
      catalog_id: "star-mc-label2",
      connector: "cloud_poll",
      last_seen_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    });

    const body = await (await GET(request())).json();
    expect(body.printer.state).toBe("offline");
  });

  it("scopes the lookup to the calling kit", async () => {
    resolveActiveLocationMock.mockResolvedValue(null);
    await GET(request("booth-9"));
    expect(resolveActiveLocationMock).toHaveBeenCalledWith("qkit", "booth-9");
  });
});
