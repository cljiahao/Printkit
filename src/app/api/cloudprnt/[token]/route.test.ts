import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveDeviceMock = vi.fn();
const renderJobPngMock = vi.fn();
const logDeviceEventMock = vi.fn().mockResolvedValue(undefined);
const awaitsConfirmationMock = vi.fn();
const latestSentJobIdMock = vi.fn();
vi.mock("@/lib/connectors/cloud-poll/service", () => ({
  resolveDevice: (...args: unknown[]) => resolveDeviceMock(...args),
  renderJobPng: (...args: unknown[]) => renderJobPngMock(...args),
  logDeviceEvent: (...args: unknown[]) => logDeviceEventMock(...args),
  awaitsConfirmation: (...args: unknown[]) => awaitsConfirmationMock(...args),
  latestSentJobId: (...args: unknown[]) => latestSentJobIdMock(...args),
}));

const peekClaimableJobMock = vi.fn();
const touchPrinterSeenMock = vi.fn().mockResolvedValue(undefined);
const bindDeviceRefMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/printers", () => ({
  peekClaimableJob: (...args: unknown[]) => peekClaimableJobMock(...args),
  touchPrinterSeen: (...args: unknown[]) => touchPrinterSeenMock(...args),
  bindDeviceRef: (...args: unknown[]) => bindDeviceRefMock(...args),
}));

const claimJobMock = vi.fn();
const sweepLocationMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/job-dispatch", () => ({
  claimJob: (...args: unknown[]) => claimJobMock(...args),
  sweepLocation: (...args: unknown[]) => sweepLocationMock(...args),
}));

const updatePrintJobStatusMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/print-jobs", () => ({
  updatePrintJobStatus: (...args: unknown[]) =>
    updatePrintJobStatusMock(...args),
}));

import { POST, GET, DELETE } from "./route";

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

const context = { params: Promise.resolve({ token: "tok" }) };

function pollRequest(body: unknown = { printerMAC: "00:11:62:aa:bb:cc" }) {
  return new Request("https://printkit.test/api/cloudprnt/tok", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resolveDeviceMock.mockReset().mockResolvedValue(printer);
  renderJobPngMock.mockReset().mockResolvedValue(Buffer.from([1, 2, 3]));
  logDeviceEventMock.mockClear();
  awaitsConfirmationMock.mockReset().mockResolvedValue(true);
  peekClaimableJobMock.mockReset().mockResolvedValue(null);
  touchPrinterSeenMock.mockClear();
  bindDeviceRefMock.mockClear();
  claimJobMock.mockReset();
  sweepLocationMock.mockClear();
  updatePrintJobStatusMock.mockClear();
});

describe("cloudprnt route: authentication", () => {
  it("rejects an unknown token on every method", async () => {
    resolveDeviceMock.mockResolvedValue(null);

    expect((await POST(pollRequest(), context)).status).toBe(401);
    expect(
      (
        await GET(
          new Request("https://printkit.test/api/cloudprnt/tok?token=job-1"),
          context,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await DELETE(
          new Request(
            "https://printkit.test/api/cloudprnt/tok?token=job-1&code=200",
            { method: "DELETE" },
          ),
          context,
        )
      ).status,
    ).toBe(401);
  });
});

describe("cloudprnt route: poll", () => {
  it("answers no job and records the printer as seen", async () => {
    const res = await POST(pollRequest(), context);

    expect(await res.json()).toEqual({ jobReady: false });
    expect(touchPrinterSeenMock).toHaveBeenCalledWith(printer);
    expect(sweepLocationMock).toHaveBeenCalledWith("loc-1");
  });

  it("advertises a waiting job without claiming it", async () => {
    peekClaimableJobMock.mockResolvedValue({ id: "job-1" });

    const body = await (await POST(pollRequest(), context)).json();

    expect(body).toMatchObject({ jobReady: true, jobToken: "job-1" });
    expect(claimJobMock).not.toHaveBeenCalled();
  });

  it("binds the first device that presents the token", async () => {
    await POST(pollRequest(), context);
    expect(bindDeviceRefMock).toHaveBeenCalledWith("printer-1", "001162aabbcc");
  });

  it("rejects different hardware reusing the token and logs it", async () => {
    resolveDeviceMock.mockResolvedValue({
      ...printer,
      device_ref: "001162aabbcc",
    });

    const res = await POST(
      pollRequest({ printerMAC: "99:99:99:99:99:99" }),
      context,
    );

    expect(res.status).toBe(401);
    expect(logDeviceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "printer-1" }),
      "cloudprnt_mac_mismatch",
      expect.objectContaining({ presented: "999999999999" }),
    );
  });

  it("accepts the same hardware polling again", async () => {
    resolveDeviceMock.mockResolvedValue({
      ...printer,
      device_ref: "001162aabbcc",
    });

    const res = await POST(pollRequest(), context);

    expect(res.status).toBe(200);
    expect(bindDeviceRefMock).not.toHaveBeenCalled();
  });
});

describe("cloudprnt route: job fetch", () => {
  function getRequest(query = "?token=job-1") {
    return new Request(`https://printkit.test/api/cloudprnt/tok${query}`);
  }

  it("claims the job and returns a PNG", async () => {
    claimJobMock.mockResolvedValue({ id: "job-1", payload: {} });

    const res = await GET(getRequest(), context);

    expect(claimJobMock).toHaveBeenCalledWith("loc-1", "job-1");
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("returns 404 for a job that was already claimed", async () => {
    claimJobMock.mockResolvedValue(null);
    expect((await GET(getRequest(), context)).status).toBe(404);
  });

  it("claims the oldest waiting job for firmware that sends no token", async () => {
    claimJobMock.mockResolvedValue({ id: "job-1", payload: {} });

    const res = await GET(getRequest(""), context);

    expect(claimJobMock).toHaveBeenCalledWith("loc-1", undefined);
    expect(res.status).toBe(200);
  });
});

describe("cloudprnt route: confirmation", () => {
  function deleteRequest(query: string) {
    return new Request(`https://printkit.test/api/cloudprnt/tok?${query}`, {
      method: "DELETE",
    });
  }

  it("marks the job printed on a success code", async () => {
    await DELETE(deleteRequest("token=job-1&code=200"), context);
    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-1",
      "printed",
      undefined,
    );
  });

  it("marks the job failed on an error code", async () => {
    await DELETE(deleteRequest("token=job-1&code=500"), context);
    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-1",
      "failed",
      "device_reported_error",
    );
  });

  it("confirms the last sent job for firmware that sends no token", async () => {
    latestSentJobIdMock.mockResolvedValue("job-7");

    await DELETE(deleteRequest("code=200%20OK"), context);

    expect(latestSentJobIdMock).toHaveBeenCalledWith("loc-1");
    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-7",
      "printed",
      undefined,
    );
  });

  it("answers 404 when a token-less confirmation has nothing to confirm", async () => {
    latestSentJobIdMock.mockResolvedValue(null);

    const res = await DELETE(deleteRequest("code=200%20OK"), context);

    expect(res.status).toBe(404);
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("refuses to confirm a job belonging to another printer", async () => {
    awaitsConfirmationMock.mockResolvedValue(false);

    const res = await DELETE(deleteRequest("token=job-9&code=200"), context);

    expect(res.status).toBe(404);
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });
});
