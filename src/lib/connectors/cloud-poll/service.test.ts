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

const rpcMock = vi.fn();
const selectMock = vi.fn();
const insertMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: () => ({ select: selectMock, insert: insertMock }),
      rpc: rpcMock,
    }),
}));

import {
  resolveDevice,
  renderJobPng,
  readCloudPollJob,
  claimCloudPollJob,
  logDeviceEvent,
} from "./service";
import { cloudPollJobToken } from "./job-token";
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
  rpcMock.mockReset();
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

describe("logDeviceEvent when the client itself fails", () => {
  it("swallows the error", async () => {
    insertMock.mockRejectedValueOnce(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(logDeviceEvent(printer, "x", {})).resolves.toBeUndefined();
  });
});

const revision = {
  id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-10-09T00:00:00.123456+00:00",
  requeued_at: null,
};
function returnedJob(data: unknown, error: unknown = null) {
  const filters: Array<[string, unknown]> = [];
  const query = {
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return query;
    },
    maybeSingle: () => Promise.resolve({ data, error }),
  };
  selectMock.mockReturnValue(query);
  return filters;
}
it("reads only the printer's own current revision", async () => {
  const filters = returnedJob({ ...revision, status: "sent" });
  expect(
    await readCloudPollJob(cloudPollJobToken(revision), "loc-1"),
  ).toMatchObject(revision);
  expect(filters).toEqual([
    ["id", revision.id],
    ["location_id", "loc-1"],
  ]);
});
it("refuses a stale same-job token after requeue", async () => {
  const newer = {
    ...revision,
    requeued_at: "2026-10-09T00:00:01.123456+00:00",
    status: "sent",
  };
  returnedJob(newer);
  expect(
    await readCloudPollJob(cloudPollJobToken(revision), "loc-1"),
  ).toBeNull();
  expect(await readCloudPollJob(cloudPollJobToken(newer), "loc-1")).toEqual(
    newer,
  );
});
it.each([null, revision.id, "malformed"])(
  "refuses missing or legacy token %s before database access",
  async (token) => {
    expect(await readCloudPollJob(token, "loc-1")).toBeNull();
    expect(selectMock).not.toHaveBeenCalled();
  },
);
it("fails closed on missing jobs and failed reads", async () => {
  returnedJob(null);
  expect(
    await readCloudPollJob(cloudPollJobToken(revision), "loc-1"),
  ).toBeNull();
  returnedJob(null, { message: "offline" });
  expect(
    await readCloudPollJob(cloudPollJobToken(revision), "loc-1"),
  ).toBeNull();
});
it("passes both queue timestamps into the atomic claim", async () => {
  rpcMock.mockResolvedValue({
    data: [{ ...revision, status: "sent" }],
    error: null,
  });
  expect(await claimCloudPollJob("loc-1", revision)).toMatchObject({
    status: "sent",
  });
  expect(rpcMock).toHaveBeenCalledWith("claim_cloud_poll_job", {
    p_location_id: "loc-1",
    p_job_id: revision.id,
    p_created_at: revision.created_at,
    p_requeued_at: null,
  });
});
it("returns no claim after a competing revision change or database fault", async () => {
  rpcMock
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: null, error: { message: "offline" } });
  expect(await claimCloudPollJob("loc-1", revision)).toBeNull();
  expect(await claimCloudPollJob("loc-1", revision)).toBeNull();
});
