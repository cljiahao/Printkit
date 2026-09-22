import { describe, it, expect, vi, beforeEach } from "vitest";

const getPrinterByTokenHashMock = vi.fn();
vi.mock("@/lib/printers", () => ({
  getPrinterByTokenHash: (...args: unknown[]) =>
    getPrinterByTokenHashMock(...args),
}));

const rasterizeLayoutMock = vi.fn().mockResolvedValue(Buffer.from([9]));
vi.mock("@/lib/label-raster", () => ({
  rasterizeLayout: (...args: unknown[]) => rasterizeLayoutMock(...args),
}));

const selectMock = vi.fn();
const insertMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: () => ({ select: selectMock, insert: insertMock }),
    }),
}));

import {
  resolveDevice,
  renderJobPng,
  awaitsConfirmation,
  latestSentJobId,
  logDeviceEvent,
} from "./service";
import { hashDeviceToken } from "@/lib/device-credentials";

const printer = {
  id: "printer-1",
  vendor_id: "vendor-1",
  location_id: "loc-1",
  catalog_id: "star-mc-label2",
  connector: "cloud_poll",
  driver: "star-cloudprnt",
  display_name: "Star mC-Label2",
  label_width_mm: 50,
  label_height_mm: 30,
  device_ref: null,
  last_seen_at: null,
  created_at: "2026-09-20T00:00:00.000Z",
};

beforeEach(() => {
  getPrinterByTokenHashMock.mockReset();
  rasterizeLayoutMock.mockClear();
  selectMock.mockReset();
  insertMock.mockClear();
});

describe("resolveDevice", () => {
  it("looks the printer up by the token's hash, never the raw token", async () => {
    getPrinterByTokenHashMock.mockResolvedValue(printer);

    await resolveDevice("secret-token");

    expect(getPrinterByTokenHashMock).toHaveBeenCalledWith(
      hashDeviceToken("secret-token"),
    );
  });

  it("returns null for an empty token without a lookup", async () => {
    expect(await resolveDevice("")).toBeNull();
    expect(getPrinterByTokenHashMock).not.toHaveBeenCalled();
  });

  it("refuses a printer on another connector", async () => {
    getPrinterByTokenHashMock.mockResolvedValue({
      ...printer,
      connector: "bridge",
    });
    expect(await resolveDevice("secret-token")).toBeNull();
  });
});

describe("renderJobPng", () => {
  it("renders at the printer's own label size and dpi", async () => {
    await renderJobPng(
      { payload: { customer_name: "Ada", order_number: "7" } },
      printer,
    );

    const [layout, dpi] = rasterizeLayoutMock.mock.calls[0];
    expect(layout).toMatchObject({ widthMm: 50, heightMm: 30 });
    expect(dpi).toBe(300);
  });

  it("falls back to 203 dpi for a printer not in the catalog", async () => {
    await renderJobPng({ payload: {} }, { ...printer, catalog_id: "gone" });
    expect(rasterizeLayoutMock.mock.calls[0][1]).toBe(203);
  });
});

describe("awaitsConfirmation", () => {
  it("is true when the job is at this location", async () => {
    const filters: Array<[string, unknown]> = [];
    const query = {
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      },
      maybeSingle: () =>
        Promise.resolve({ data: { id: "job-1" }, error: null }),
    };
    selectMock.mockReturnValue(query);

    expect(await awaitsConfirmation("job-1", "loc-1")).toBe(true);
    expect(filters).toEqual([
      ["id", "job-1"],
      ["location_id", "loc-1"],
      ["status", "sent"],
    ]);
  });

  it("is false when it is not", async () => {
    const query = {
      eq: () => query,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    selectMock.mockReturnValue(query);
    expect(await awaitsConfirmation("job-9", "loc-1")).toBe(false);
  });

  it("is false when the query fails", async () => {
    const query = {
      eq: () => query,
      maybeSingle: () =>
        Promise.resolve({ data: null, error: { message: "boom" } }),
    };
    selectMock.mockReturnValue(query);
    expect(await awaitsConfirmation("job-1", "loc-1")).toBe(false);
  });
});

describe("logDeviceEvent", () => {
  it("writes an audit row against the printer's vendor", async () => {
    await logDeviceEvent(printer, "cloudprnt_mac_mismatch", { bound: "a" });

    expect(insertMock).toHaveBeenCalledWith({
      admin_id: "vendor-1",
      action: "cloudprnt_mac_mismatch",
      target_id: "printer-1",
      detail: { bound: "a" },
    });
  });

  it("never throws when the audit write fails", async () => {
    insertMock.mockResolvedValue({ error: { message: "boom" } });
    await expect(
      logDeviceEvent(printer, "cloudprnt_mac_mismatch", {}),
    ).resolves.toBeUndefined();
  });
});

describe("latestSentJobId", () => {
  function sentJobs(data: unknown, error: unknown = null) {
    const query = {
      eq: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: () => Promise.resolve({ data, error }),
    };
    selectMock.mockReturnValue(query);
  }

  it("names the location's most recently sent job", async () => {
    sentJobs({ id: "job-7" });
    expect(await latestSentJobId("loc-1")).toBe("job-7");
  });

  it("is null when nothing is waiting for confirmation", async () => {
    sentJobs(null);
    expect(await latestSentJobId("loc-1")).toBeNull();
  });

  it("is null when the query fails", async () => {
    sentJobs(null, { message: "boom" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await latestSentJobId("loc-1")).toBeNull();
  });
});

describe("logDeviceEvent when the client itself fails", () => {
  it("swallows the error", async () => {
    insertMock.mockRejectedValueOnce(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(logDeviceEvent(printer, "x", {})).resolves.toBeUndefined();
  });
});
