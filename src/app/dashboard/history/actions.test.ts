import { describe, it, expect, vi, beforeEach } from "vitest";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const getVendorSessionMock = vi.fn();
vi.mock("@/lib/vendor-session", () => ({
  getVendorSession: () => getVendorSessionMock(),
}));

const updatePrintJobStatusMock = vi.fn();
vi.mock("@/lib/print-jobs", () => ({
  updatePrintJobStatus: (...args: unknown[]) =>
    updatePrintJobStatusMock(...args),
}));

const dispatchJobMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/job-dispatch", () => ({
  dispatchJob: (...args: unknown[]) => dispatchJobMock(...args),
}));

const ATTEMPT = "2026-10-09T00:00:00.123456+00:00";
const maybeSingleMock = vi.fn();
const sessionFromMock = vi.fn((table: string) => {
  if (table === "print_jobs") {
    return {
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      }),
    };
  }
  throw new Error(`unexpected table on session client: ${table}`);
});

const insertMock = vi.fn().mockResolvedValue({ error: null });
const locationMaybeSingleMock = vi.fn();
const locationSelectMock = vi.fn();
const locationEqIdMock = vi.fn();
const locationEqVendorMock = vi.fn();
locationSelectMock.mockImplementation(() => ({ eq: locationEqIdMock }));
locationEqIdMock.mockImplementation(() => ({ eq: locationEqVendorMock }));
locationEqVendorMock.mockImplementation(() => ({
  maybeSingle: locationMaybeSingleMock,
}));

const jobUpdateEqIdMock = vi.fn();
const jobUpdateEqVendorMock = vi.fn();
const jobUpdateStatusMock = vi.fn();
const jobUpdateLocationMock = vi.fn();
const jobUpdateSelectMock = vi.fn();
const jobUpdateSingleMock = vi.fn();
jobUpdateEqVendorMock.mockImplementation(() => ({ eq: jobUpdateStatusMock }));
jobUpdateStatusMock.mockImplementation(() => ({ is: jobUpdateLocationMock }));
jobUpdateLocationMock.mockImplementation(() => ({
  select: jobUpdateSelectMock,
}));
jobUpdateSelectMock.mockImplementation(() => ({
  maybeSingle: jobUpdateSingleMock,
}));
const jobUpdateMock = vi.fn(() => ({ eq: jobUpdateEqIdMock }));
jobUpdateEqIdMock.mockImplementation(() => ({ eq: jobUpdateEqVendorMock }));

const serviceFromMock = vi.fn((table: string) => {
  if (table === "admin_audit") {
    return { insert: insertMock };
  }
  if (table === "print_locations") {
    return { select: locationSelectMock };
  }
  if (table === "print_jobs") {
    return { update: jobUpdateMock };
  }
  throw new Error(`unexpected table on service client: ${table}`);
});
const service = { from: serviceFromMock };

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => Promise.resolve(service),
}));

import { reprintJob, assignPrintLocation } from "./actions";

describe("reprintJob", () => {
  beforeEach(() => {
    getVendorSessionMock.mockReset();
    updatePrintJobStatusMock.mockReset();
    maybeSingleMock.mockReset();
    insertMock.mockReset().mockResolvedValue({ error: null });
    sessionFromMock.mockClear();
    serviceFromMock.mockClear();
    revalidatePathMock.mockClear();
    getVendorSessionMock.mockResolvedValue({
      supabase: { from: sessionFromMock },
      user: { id: "vendor-1" },
    });
  });

  it("returns an error when the job doesn't belong to this vendor", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await reprintJob("job-1");

    expect(result).toEqual({ success: false, error: "Print job not found" });
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns an error when the job is still queued or sent (would race an in-flight print)", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { status: "queued" },
      error: null,
    });

    const result = await reprintJob("job-1");

    expect(result).toEqual({
      success: false,
      error: "Only a failed or already-printed job can be reprinted",
    });
  });

  it("resets a failed job to queued and logs an admin_audit entry", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { status: "failed", sent_at: ATTEMPT, requeued_at: null },
      error: null,
    });
    updatePrintJobStatusMock.mockResolvedValue({ ok: true });

    const result = await reprintJob("job-1");

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-1",
      "queued",
      undefined,
      { expectedStatus: "failed", sentAt: ATTEMPT, requeuedAt: null },
    );
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: "vendor-1",
        action: "manual_reprint_triggered",
        target_id: "job-1",
      }),
    );
    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/history");
  });

  it("also allows resetting an already-printed job to queued (vendor lost/peeled the label)", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { status: "printed", sent_at: ATTEMPT, requeued_at: null },
      error: null,
    });
    updatePrintJobStatusMock.mockResolvedValue({ ok: true });

    const result = await reprintJob("job-1");

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith(
      "job-1",
      "queued",
      undefined,
      { expectedStatus: "printed", sentAt: ATTEMPT, requeuedAt: null },
    );
    expect(result).toEqual({ success: true });
  });
});

it("preserves a successful requeue when the audit request rejects", async () => {
  getVendorSessionMock.mockResolvedValue({
    supabase: { from: sessionFromMock },
    user: { id: "vendor-1" },
  });
  maybeSingleMock.mockResolvedValue({
    data: { status: "failed", sent_at: ATTEMPT, requeued_at: null },
    error: null,
  });
  updatePrintJobStatusMock.mockResolvedValue({ ok: true });
  insertMock.mockRejectedValueOnce(new Error("audit offline"));
  expect(await reprintJob("job-1")).toEqual({ success: true });
  expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/history");
});

describe("assignPrintLocation", () => {
  beforeEach(() => {
    getVendorSessionMock.mockReset();
    maybeSingleMock.mockReset();
    updatePrintJobStatusMock.mockReset();
    locationMaybeSingleMock.mockReset();
    // Structural chain mocks (select/eq/update/eq) keep their
    // mockImplementation across tests — only clear call history so the
    // exact-args assertions below start from a clean slate each test.
    locationSelectMock.mockClear();
    locationEqIdMock.mockClear();
    locationEqVendorMock.mockClear();
    jobUpdateMock.mockClear();
    jobUpdateEqIdMock.mockClear();
    jobUpdateEqVendorMock.mockClear();
    jobUpdateStatusMock.mockClear();
    jobUpdateLocationMock.mockClear();
    jobUpdateSelectMock.mockClear();
    jobUpdateSingleMock.mockReset();
    dispatchJobMock.mockClear();
    sessionFromMock.mockClear();
    serviceFromMock.mockClear();
    revalidatePathMock.mockClear();
    getVendorSessionMock.mockResolvedValue({
      supabase: { from: sessionFromMock },
      user: { id: "vendor-1" },
    });
  });

  it("assigns an unrouted queued job without changing its status", async () => {
    locationMaybeSingleMock.mockResolvedValue({
      data: { id: "loc-1" },
      error: null,
    });
    jobUpdateSingleMock.mockResolvedValue({
      data: { id: "job-1" },
      error: null,
    });

    const result = await assignPrintLocation("job-1", "loc-1");

    expect(jobUpdateMock).toHaveBeenCalledWith({
      location_id: "loc-1",
      requeued_at: expect.any(String),
    });
    expect(jobUpdateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: expect.anything() }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("scopes the print_locations ownership lookup by exact id and vendor_id", async () => {
    locationMaybeSingleMock.mockResolvedValue({
      data: { id: "loc-1" },
      error: null,
    });
    jobUpdateSingleMock.mockResolvedValue({
      data: { id: "job-1" },
      error: null,
    });

    await assignPrintLocation("job-1", "loc-1");

    expect(locationSelectMock).toHaveBeenCalledWith("id");
    expect(locationEqIdMock).toHaveBeenCalledWith("id", "loc-1");
    expect(locationEqVendorMock).toHaveBeenCalledWith("vendor_id", "vendor-1");
  });

  it("scopes the print_jobs update by exact id and vendor_id", async () => {
    locationMaybeSingleMock.mockResolvedValue({
      data: { id: "loc-1" },
      error: null,
    });
    jobUpdateSingleMock.mockResolvedValue({
      data: { id: "job-1" },
      error: null,
    });

    await assignPrintLocation("job-1", "loc-1");

    expect(jobUpdateEqIdMock).toHaveBeenCalledWith("id", "job-1");
    expect(jobUpdateEqVendorMock).toHaveBeenCalledWith("vendor_id", "vendor-1");
  });

  it("writes through the service-role client, not the session-scoped client", async () => {
    locationMaybeSingleMock.mockResolvedValue({
      data: { id: "loc-1" },
      error: null,
    });
    jobUpdateSingleMock.mockResolvedValue({
      data: { id: "job-1" },
      error: null,
    });

    await assignPrintLocation("job-1", "loc-1");

    // print_jobs has no UPDATE grant/policy for `authenticated` — only the
    // service client can write it. The session client is never touched.
    expect(sessionFromMock).not.toHaveBeenCalled();
    expect(serviceFromMock).toHaveBeenCalledWith("print_jobs");
    expect(jobUpdateEqVendorMock).toHaveBeenCalled();
  });

  it("rejects a locationId that doesn't belong to the calling vendor", async () => {
    locationMaybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await assignPrintLocation("job-1", "someone-elses-loc");

    expect(result).toEqual({
      ok: false,
      error: "That booth doesn't belong to your account.",
    });
    expect(jobUpdateMock).not.toHaveBeenCalled();
  });

  it("returns an error result on a database failure", async () => {
    locationMaybeSingleMock.mockResolvedValue({
      data: { id: "loc-1" },
      error: null,
    });
    jobUpdateSingleMock.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });

    const result = await assignPrintLocation("job-1", "loc-1");

    expect(result).toEqual({
      ok: false,
      error: "Could not assign a booth to this job.",
    });
  });

  it("checks the unrouted queued state atomically in the update", async () => {
    locationMaybeSingleMock.mockResolvedValue({
      data: { id: "loc-1" },
      error: null,
    });
    jobUpdateSingleMock.mockResolvedValue({
      data: { id: "job-1" },
      error: null,
    });

    await assignPrintLocation("job-1", "loc-1");

    expect(maybeSingleMock).not.toHaveBeenCalled();
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
    expect(jobUpdateStatusMock).toHaveBeenCalledWith("status", "queued");
    expect(jobUpdateLocationMock).toHaveBeenCalledWith("location_id", null);
  });

  it("does not dispatch or claim success when a competing assignment won", async () => {
    locationMaybeSingleMock.mockResolvedValue({
      data: { id: "loc-1" },
      error: null,
    });
    jobUpdateSingleMock.mockResolvedValue({ data: null, error: null });
    expect(await assignPrintLocation("job-1", "loc-1")).toEqual({
      ok: false,
      error: "This job is no longer waiting for a booth.",
    });
    expect(dispatchJobMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

it("refuses a delayed reprint after another attempt returned to printed", async () => {
  const current = {
    status: "printed",
    sent_at: "2026-10-09T00:00:01.123456+00:00",
    requeued_at: "2026-10-09T00:00:00.223456+00:00",
  };
  getVendorSessionMock.mockReset().mockResolvedValue({
    supabase: { from: sessionFromMock },
    user: { id: "vendor-1" },
  });
  maybeSingleMock.mockReset().mockResolvedValue({
    data: { status: "printed", sent_at: ATTEMPT, requeued_at: null },
    error: null,
  });
  updatePrintJobStatusMock
    .mockReset()
    .mockImplementation(async (_id, _status, _reason, conditions) => ({
      ok:
        conditions.sentAt === current.sent_at &&
        conditions.requeuedAt === current.requeued_at,
      error: "Print attempt changed",
    }));
  dispatchJobMock.mockClear();
  insertMock.mockReset().mockResolvedValue({ error: null });
  revalidatePathMock.mockClear();
  expect(await reprintJob("job-1")).toEqual({
    success: false,
    error: "Print attempt changed",
  });
  expect(dispatchJobMock).not.toHaveBeenCalled();
  expect(insertMock).not.toHaveBeenCalled();
  expect(revalidatePathMock).not.toHaveBeenCalled();
  maybeSingleMock.mockResolvedValue({ data: current, error: null });
  expect(await reprintJob("job-1")).toEqual({ success: true });
  expect(dispatchJobMock).toHaveBeenCalledExactlyOnceWith("job-1");
});
