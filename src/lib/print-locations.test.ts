import { describe, it, expect, vi } from "vitest";

const fromMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => Promise.resolve({ from: fromMock }),
}));

import {
  createOrUpdatePrintLocation,
  resolveActiveLocation,
  listActiveLocations,
} from "./print-locations";

describe("createOrUpdatePrintLocation", () => {
  it("upserts on (source_kit, source_ref) and returns the row id", async () => {
    const upsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue({ data: { id: "loc-1" }, error: null }),
      }),
    });
    fromMock.mockReturnValue({ upsert });

    const result = await createOrUpdatePrintLocation({
      vendorId: "vendor-1",
      sourceKit: "qkit",
      sourceRef: "booth-1",
      label: "Kopitiam Cart",
      active: true,
    });

    expect(result).toEqual({ ok: true, id: "loc-1" });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_id: "vendor-1",
        source_kit: "qkit",
        source_ref: "booth-1",
        label: "Kopitiam Cart",
        active: true,
      }),
      expect.objectContaining({ onConflict: "source_kit,source_ref" }),
    );
  });

  it("returns a 500 result on an unexpected database error", async () => {
    const upsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "boom", code: "500" },
        }),
      }),
    });
    fromMock.mockReturnValue({ upsert });

    const result = await createOrUpdatePrintLocation({
      vendorId: "vendor-1",
      sourceKit: "qkit",
      sourceRef: "booth-1",
      label: "Kopitiam Cart",
      active: true,
    });

    expect(result.ok).toBe(false);
  });
});

describe("resolveActiveLocation", () => {
  it("returns the location when an active match exists, scoping by exact filter args", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "loc-1", vendor_id: "vendor-1" },
      error: null,
    });
    const eqActiveMock = vi.fn().mockReturnValue({ maybeSingle });
    const eqRefMock = vi.fn().mockReturnValue({ eq: eqActiveMock });
    const eqKitMock = vi.fn().mockReturnValue({ eq: eqRefMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqKitMock });
    fromMock.mockReturnValue({ select: selectMock });

    const result = await resolveActiveLocation("qkit", "booth-1");

    expect(selectMock).toHaveBeenCalledWith("id, vendor_id");
    expect(eqKitMock).toHaveBeenCalledWith("source_kit", "qkit");
    expect(eqRefMock).toHaveBeenCalledWith("source_ref", "booth-1");
    expect(eqActiveMock).toHaveBeenCalledWith("active", true);
    expect(result).toEqual({ id: "loc-1", vendorId: "vendor-1" });
  });

  it("returns null when no active location matches", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqActiveMock = vi.fn().mockReturnValue({ maybeSingle });
    const eqRefMock = vi.fn().mockReturnValue({ eq: eqActiveMock });
    const eqKitMock = vi.fn().mockReturnValue({ eq: eqRefMock });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eqKitMock }),
    });

    const result = await resolveActiveLocation("qkit", "unknown-ref");
    expect(result).toBeNull();
  });

  it("logs and returns null on a query error", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    });

    const result = await resolveActiveLocation("qkit", "booth-1");

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "resolveActiveLocation failed",
      "connection reset",
    );
    consoleErrorSpy.mockRestore();
  });
});

describe("listActiveLocations", () => {
  it("returns active locations for a vendor, scoping by exact filter args", async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: [{ id: "loc-1", label: "Kopitiam Cart", source_ref: "booth-1" }],
      error: null,
    });
    const eqActiveMock = vi.fn().mockReturnValue({ order: orderMock });
    const eqVendorMock = vi.fn().mockReturnValue({ eq: eqActiveMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqVendorMock });
    fromMock.mockReturnValue({ select: selectMock });

    const result = await listActiveLocations("vendor-1");

    expect(selectMock).toHaveBeenCalledWith("id, label, source_ref");
    expect(eqVendorMock).toHaveBeenCalledWith("vendor_id", "vendor-1");
    expect(eqActiveMock).toHaveBeenCalledWith("active", true);
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(result).toEqual([
      { id: "loc-1", label: "Kopitiam Cart", source_ref: "booth-1" },
    ]);
  });

  it("returns an empty array on a query error rather than throwing", async () => {
    const orderMock = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ order: orderMock }),
        }),
      }),
    });

    const result = await listActiveLocations("vendor-1");
    expect(result).toEqual([]);
  });
});
