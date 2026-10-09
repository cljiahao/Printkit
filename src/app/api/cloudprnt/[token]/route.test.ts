import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveDeviceMock = vi.fn();
const renderJobPngMock = vi.fn();
const logDeviceEventMock = vi.fn().mockResolvedValue(undefined);
const readCloudPollJobMock = vi.fn();
const claimCloudPollJobMock = vi.fn();
vi.mock("@/lib/connectors/cloud-poll/service", () => ({
  resolveDevice: (...args: unknown[]) => resolveDeviceMock(...args),
  renderJobPng: (...args: unknown[]) => renderJobPngMock(...args),
  logDeviceEvent: (...args: unknown[]) => logDeviceEventMock(...args),
  readCloudPollJob: (...args: unknown[]) => readCloudPollJobMock(...args),
  claimCloudPollJob: (...args: unknown[]) => claimCloudPollJobMock(...args),
}));

const peekClaimableJobMock = vi.fn();
const touchPrinterSeenMock = vi.fn().mockResolvedValue(undefined);
const bindDeviceRefMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/printers", () => ({
  peekClaimableJob: (...args: unknown[]) => peekClaimableJobMock(...args),
  touchPrinterSeen: (...args: unknown[]) => touchPrinterSeenMock(...args),
  bindDeviceRef: (...args: unknown[]) => bindDeviceRefMock(...args),
}));

const sweepLocationMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/job-dispatch", () => ({
  sweepLocation: (...args: unknown[]) => sweepLocationMock(...args),
}));

const updatePrintJobStatusMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/print-jobs", () => ({
  updatePrintJobStatus: (...args: unknown[]) =>
    updatePrintJobStatusMock(...args),
}));

import { POST, GET, DELETE } from "./route";
import { cloudPollJobToken } from "@/lib/connectors/cloud-poll/job-token";

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

const JOB = {
  id: "11111111-1111-4111-8111-111111111111",
  payload: {},
  status: "sent",
  created_at: "2026-10-09T00:00:00.123456+00:00",
  requeued_at: null,
  sent_at: "2026-10-09T00:00:01.123456+00:00",
};
const JOB_TOKEN = cloudPollJobToken(JOB);
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
  readCloudPollJobMock.mockReset().mockResolvedValue(JOB);
  claimCloudPollJobMock.mockReset().mockResolvedValue(JOB);
  peekClaimableJobMock.mockReset().mockResolvedValue(null);
  touchPrinterSeenMock.mockClear();
  bindDeviceRefMock.mockClear();
  sweepLocationMock.mockClear();
  updatePrintJobStatusMock.mockReset().mockResolvedValue({ ok: true });
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
            `https://printkit.test/api/cloudprnt/tok?token=${JOB_TOKEN}&code=200`,
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
    peekClaimableJobMock.mockResolvedValue(JOB);

    const body = await (await POST(pollRequest(), context)).json();

    expect(body).toMatchObject({ jobReady: true, jobToken: JOB_TOKEN });
    expect(claimCloudPollJobMock).not.toHaveBeenCalled();
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
  function getRequest(query = "?token=" + JOB_TOKEN) {
    return new Request(`https://printkit.test/api/cloudprnt/tok${query}`);
  }

  it("claims the job and returns a PNG", async () => {
    readCloudPollJobMock.mockResolvedValue({ ...JOB, status: "queued" });

    const res = await GET(getRequest(), context);

    expect(claimCloudPollJobMock).toHaveBeenCalledWith(
      "loc-1",
      expect.objectContaining({
        id: JOB.id,
        created_at: JOB.created_at,
        requeued_at: null,
      }),
    );
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("refuses firmware without a revision token", async () => {
    readCloudPollJobMock.mockResolvedValue(null);
    expect((await GET(getRequest(""), context)).status).toBe(404);
    expect(claimCloudPollJobMock).not.toHaveBeenCalled();
  });
});

describe("cloudprnt route: confirmation", () => {
  function deleteRequest(query: string) {
    return new Request(`https://printkit.test/api/cloudprnt/tok?${query}`, {
      method: "DELETE",
    });
  }

  it("marks the job printed on a success code", async () => {
    await DELETE(deleteRequest("token=" + JOB_TOKEN + "&code=200"), context);
    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      JOB.id,
      "printed",
      undefined,
      {
        locationId: "loc-1",
        expectedStatus: "sent",
        sentAt: JOB.sent_at,
        requeuedAt: JOB.requeued_at,
      },
    );
  });

  it("marks the job failed on an error code", async () => {
    await DELETE(deleteRequest("token=" + JOB_TOKEN + "&code=500"), context);
    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      JOB.id,
      "failed",
      "device_reported_error",
      {
        locationId: "loc-1",
        expectedStatus: "sent",
        sentAt: JOB.sent_at,
        requeuedAt: JOB.requeued_at,
      },
    );
  });

  it("rejects token-less confirmation without guessing a job", async () => {
    readCloudPollJobMock.mockResolvedValue(null);
    expect((await DELETE(deleteRequest("code=200"), context)).status).toBe(404);
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });

  it("refuses to confirm a job belonging to another printer", async () => {
    readCloudPollJobMock.mockResolvedValue(null);

    const res = await DELETE(deleteRequest("token=job-9&code=200"), context);

    expect(res.status).toBe(404);
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });
});

it("does not acknowledge a CloudPRNT result when persistence fails", async () => {
  updatePrintJobStatusMock.mockResolvedValueOnce({
    ok: false,
    error: "Could not update print job status.",
  });
  const response = await DELETE(
    new Request(
      `https://printkit.test/api/cloudprnt/tok?token=${JOB_TOKEN}&code=200`,
      { method: "DELETE" },
    ),
    context,
  );
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error: "Could not update print job status.",
  });
});

it.each(["printed", "failed"] as const)(
  "acknowledges same-revision %s confirmation retries without another callback",
  async (status) => {
    readCloudPollJobMock.mockResolvedValue({ ...JOB, status });
    const response = await DELETE(
      new Request(
        "https://printkit.test/api/cloudprnt/tok?token=" +
          JOB_TOKEN +
          "&code=" +
          (status === "printed" ? "200" : "500"),
      ),
      context,
    );
    expect(response.status).toBe(200);
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  },
);
it("cannot claim a revision that changed between lookup and the atomic claim", async () => {
  readCloudPollJobMock.mockResolvedValue({ ...JOB, status: "queued" });
  claimCloudPollJobMock.mockResolvedValue(null);
  const response = await GET(
    new Request("https://printkit.test/api/cloudprnt/tok?token=" + JOB_TOKEN),
    context,
  );
  expect(response.status).toBe(404);
  expect(renderJobPngMock).not.toHaveBeenCalled();
});
it("rejects an opposite terminal confirmation", async () => {
  readCloudPollJobMock.mockResolvedValue({ ...JOB, status: "printed" });
  const response = await DELETE(
    new Request(
      "https://printkit.test/api/cloudprnt/tok?token=" +
        JOB_TOKEN +
        "&code=500",
    ),
    context,
  );
  expect(response.status).toBe(409);
  expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
});
