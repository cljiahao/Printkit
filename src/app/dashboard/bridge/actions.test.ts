import { describe, it, expect, vi, beforeEach } from "vitest";

const updatePrintJobStatusMock = vi.fn();
vi.mock("@/lib/print-jobs", () => ({
  updatePrintJobStatus: (...args: unknown[]) =>
    updatePrintJobStatusMock(...args),
}));

import { reportPrintResult } from "./actions";

describe("reportPrintResult", () => {
  beforeEach(() => updatePrintJobStatusMock.mockReset());

  it("marks the job printed on success", async () => {
    updatePrintJobStatusMock.mockResolvedValue({ ok: true });
    const result = await reportPrintResult("job-1", "printed");
    expect(updatePrintJobStatusMock).toHaveBeenCalledWith("job-1", "printed");
    expect(result).toEqual({ success: true });
  });

  it("marks the job failed and surfaces the error", async () => {
    updatePrintJobStatusMock.mockResolvedValue({
      ok: false,
      error: "Could not update print job status.",
    });
    const result = await reportPrintResult("job-1", "failed");
    expect(result).toEqual({
      success: false,
      error: "Could not update print job status.",
    });
  });
});
