import { describe, it, expect, vi, beforeEach } from "vitest";

const updateMock = vi.fn();
const selectMock = vi.fn();
const insertMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: () => ({
        select: selectMock,
        update: updateMock,
        insert: insertMock,
      }),
    }),
}));

import {
  printerState,
  touchPrinterSeen,
  getPrinterByLocation,
  getPrinterByTokenHash,
  createPrinter,
  bindDeviceRef,
  peekClaimableJob,
  type PrinterRow,
} from "./printers";

const printer: PrinterRow = {
  id: "printer-1",
  vendor_id: "vendor-1",
  location_id: "loc-1",
  catalog_id: "feie-fp-n20h",
  connector: "vendor_cloud",
  driver: "feie",
  display_name: "Feie FP-N20H",
  label_width_mm: 50,
  label_height_mm: 30,
  device_ref: "SN123",
  last_seen_at: null,
  created_at: "2026-09-20T00:00:00.000Z",
};

beforeEach(() => {
  updateMock.mockReset();
  updateMock.mockReturnValue({
    eq: () => ({
      is: () => Promise.resolve({ error: null }),
      then: (resolve: (value: { error: null }) => void) =>
        resolve({ error: null }),
    }),
  });
  selectMock.mockReset();
  insertMock.mockReset();
});

describe("printerState", () => {
  const now = new Date("2026-09-20T10:00:00.000Z");

  it("is online inside the 60 second window", () => {
    expect(printerState("2026-09-20T09:59:30.000Z", now)).toBe("online");
  });

  it("is offline outside the window", () => {
    expect(printerState("2026-09-20T09:58:00.000Z", now)).toBe("offline");
  });

  it("is offline when the printer has never been seen", () => {
    expect(printerState(null, now)).toBe("offline");
  });
});

describe("touchPrinterSeen", () => {
  it("writes when the printer has never been seen", async () => {
    await touchPrinterSeen(printer);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("skips the write inside the throttle window", async () => {
    await touchPrinterSeen({
      ...printer,
      last_seen_at: new Date(Date.now() - 5_000).toISOString(),
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("writes again once the throttle window has passed", async () => {
    await touchPrinterSeen({
      ...printer,
      last_seen_at: new Date(Date.now() - 25_000).toISOString(),
    });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});

describe("getPrinterByLocation", () => {
  it("returns null when the location has no printer", async () => {
    selectMock.mockReturnValue({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
    });
    expect(await getPrinterByLocation("loc-1")).toBeNull();
  });

  it("returns null and does not throw on a query error", async () => {
    selectMock.mockReturnValue({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({ data: null, error: { message: "boom" } }),
      }),
    });
    expect(await getPrinterByLocation("loc-1")).toBeNull();
  });

  it("returns the printer row", async () => {
    selectMock.mockReturnValue({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: printer, error: null }),
      }),
    });
    expect(await getPrinterByLocation("loc-1")).toEqual(printer);
  });
});

describe("createPrinter", () => {
  it("copies connector, driver and label size from the catalog", async () => {
    insertMock.mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: printer, error: null }),
      }),
    });

    await createPrinter({
      vendorId: "vendor-1",
      locationId: "loc-1",
      catalogId: "feie-fp-n20h",
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_id: "vendor-1",
        location_id: "loc-1",
        catalog_id: "feie-fp-n20h",
        connector: "vendor_cloud",
        driver: "feie",
        display_name: "Feie FP-N20H",
        label_width_mm: 50,
        label_height_mm: 30,
      }),
    );
  });

  it("refuses an unknown catalog id without touching the database", async () => {
    expect(
      await createPrinter({
        vendorId: "vendor-1",
        locationId: "loc-1",
        catalogId: "not-a-printer",
      }),
    ).toBeNull();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns null on an insert error", async () => {
    insertMock.mockReturnValue({
      select: () => ({
        single: () =>
          Promise.resolve({ data: null, error: { message: "boom" } }),
      }),
    });

    expect(
      await createPrinter({
        vendorId: "vendor-1",
        locationId: "loc-1",
        catalogId: "feie-fp-n20h",
      }),
    ).toBeNull();
  });
});

describe("bindDeviceRef", () => {
  it("writes the device ref only while none is set", async () => {
    await bindDeviceRef("printer-1", "00:11:22:33:44:55");
    expect(updateMock).toHaveBeenCalledWith({
      device_ref: "00:11:22:33:44:55",
    });
  });
});

describe("peekClaimableJob", () => {
  function jobsReturn(rows: unknown[]) {
    selectMock.mockReturnValue({
      eq: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    });
  }

  it("returns the oldest job inside the expiry window", async () => {
    const older = new Date(Date.now() - 10 * 60_000).toISOString();
    const newer = new Date(Date.now() - 60_000).toISOString();
    jobsReturn([
      { id: "job-new", created_at: newer, requeued_at: null },
      { id: "job-old", created_at: older, requeued_at: null },
    ]);

    expect(await peekClaimableJob("loc-1")).toEqual({ id: "job-old" });
  });

  it("ignores an expired job", async () => {
    jobsReturn([
      {
        id: "job-expired",
        created_at: new Date(Date.now() - 31 * 60_000).toISOString(),
        requeued_at: null,
      },
    ]);

    expect(await peekClaimableJob("loc-1")).toBeNull();
  });

  it("uses requeued_at when a job was reprinted", async () => {
    jobsReturn([
      {
        id: "job-reprinted",
        created_at: new Date(Date.now() - 31 * 60_000).toISOString(),
        requeued_at: new Date().toISOString(),
      },
    ]);

    expect(await peekClaimableJob("loc-1")).toEqual({ id: "job-reprinted" });
  });

  it("returns null when the query fails", async () => {
    selectMock.mockReturnValue({
      eq: () => ({
        eq: () => ({
          order: () =>
            Promise.resolve({ data: null, error: { message: "boom" } }),
        }),
      }),
    });

    expect(await peekClaimableJob("loc-1")).toBeNull();
  });
});

describe("getPrinterByTokenHash", () => {
  it("resolves the printer that owns the credential", async () => {
    selectMock.mockReturnValue({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({ data: { printers: printer }, error: null }),
      }),
    });
    expect(await getPrinterByTokenHash("hash-1")).toEqual(printer);
  });

  it("returns null for an unknown credential", async () => {
    selectMock.mockReturnValue({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
    });
    expect(await getPrinterByTokenHash("nope")).toBeNull();
  });
});
