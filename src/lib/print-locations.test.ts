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
        single: vi
          .fn()
          .mockResolvedValue({
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
  it("returns the location when an active match exists", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({
        data: { id: "loc-1", vendor_id: "vendor-1" },
        error: null,
      });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    });

    const result = await resolveActiveLocation("qkit", "booth-1");
    expect(result).toEqual({ id: "loc-1", vendorId: "vendor-1" });
  });

  it("returns null when no active location matches", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    });

    const result = await resolveActiveLocation("qkit", "unknown-ref");
    expect(result).toBeNull();
  });
});

describe("listActiveLocations", () => {
  it("returns active locations for a vendor", async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        then: undefined,
        order: vi.fn().mockResolvedValue({
          data: [{ id: "loc-1", label: "Kopitiam Cart" }],
          error: null,
        }),
      }),
    });

    const result = await listActiveLocations("vendor-1");
    expect(result).toEqual([{ id: "loc-1", label: "Kopitiam Cart" }]);
  });
});
