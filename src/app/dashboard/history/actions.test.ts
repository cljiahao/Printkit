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
    insertMock.mockClear();
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
  });

  it("returns an error when the job isn't currently failed", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { status: "printed" },
      error: null,
    });

    const result = await reprintJob("job-1");

    expect(result).toEqual({
      success: false,
      error: "Only a failed job can be reprinted",
    });
  });

  it("resets a failed job to queued and logs an admin_audit entry", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { status: "failed" },
      error: null,
    });
    updatePrintJobStatusMock.mockResolvedValue({ ok: true });

    const result = await reprintJob("job-1");

    expect(updatePrintJobStatusMock).toHaveBeenCalledWith("job-1", "queued");
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

  it("does not revalidate when the job isn't found or isn't failed", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await reprintJob("job-1");

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
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
    jobUpdateEqVendorMock.mockReset();
    sessionFromMock.mockClear();
    serviceFromMock.mockClear();
    revalidatePathMock.mockClear();
    getVendorSessionMock.mockResolvedValue({
      supabase: { from: sessionFromMock },
      user: { id: "vendor-1" },
    });
  });

  it("sets location_id regardless of the job's current status, without touching status", async () => {
    locationMaybeSingleMock.mockResolvedValue({
      data: { id: "loc-1" },
      error: null,
    });
    jobUpdateEqVendorMock.mockResolvedValue({ error: null });

    const result = await assignPrintLocation("job-1", "loc-1");

    expect(jobUpdateMock).toHaveBeenCalledWith({ location_id: "loc-1" });
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
    jobUpdateEqVendorMock.mockResolvedValue({ error: null });

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
    jobUpdateEqVendorMock.mockResolvedValue({ error: null });

    await assignPrintLocation("job-1", "loc-1");

    expect(jobUpdateEqIdMock).toHaveBeenCalledWith("id", "job-1");
    expect(jobUpdateEqVendorMock).toHaveBeenCalledWith("vendor_id", "vendor-1");
  });

  it("writes through the service-role client, not the session-scoped client", async () => {
    locationMaybeSingleMock.mockResolvedValue({
      data: { id: "loc-1" },
      error: null,
    });
    jobUpdateEqVendorMock.mockResolvedValue({ error: null });

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
    jobUpdateEqVendorMock.mockResolvedValue({ error: { message: "boom" } });

    const result = await assignPrintLocation("job-1", "loc-1");

    expect(result).toEqual({
      ok: false,
      error: "Could not assign a booth to this job.",
    });
  });

  it("never reads or checks job status before assigning", async () => {
    locationMaybeSingleMock.mockResolvedValue({
      data: { id: "loc-1" },
      error: null,
    });
    jobUpdateEqVendorMock.mockResolvedValue({ error: null });

    await assignPrintLocation("job-1", "loc-1");

    expect(maybeSingleMock).not.toHaveBeenCalled();
    expect(updatePrintJobStatusMock).not.toHaveBeenCalled();
  });
});
