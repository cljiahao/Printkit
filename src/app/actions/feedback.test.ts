import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => Promise.resolve({ auth: { getUser: getUserMock } }),
}));

const submitVendorFeedbackMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/merqo-vendor-feedback", () => ({
  submitVendorFeedback: (...args: unknown[]) =>
    submitVendorFeedbackMock(...args),
}));

import { submitFeedbackAction } from "./feedback";

describe("submitFeedbackAction", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    submitVendorFeedbackMock.mockClear();
  });

  it("returns an error when the input is invalid", async () => {
    const result = await submitFeedbackAction({ nps: 99 });
    expect(result.success).toBe(false);
    expect(submitVendorFeedbackMock).not.toHaveBeenCalled();
  });

  it("returns an error when there's no session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await submitFeedbackAction({ nps: 8 });
    expect(result).toEqual({ success: false, error: "Please sign in first" });
  });

  it("submits feedback for the signed-in vendor", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "vendor-1" } } });
    const result = await submitFeedbackAction({ nps: 9, message: "Nice" });
    expect(result).toEqual({ success: true });
    expect(submitVendorFeedbackMock).toHaveBeenCalledWith(
      expect.anything(),
      "printkit",
      9,
      "Nice",
    );
  });
});
