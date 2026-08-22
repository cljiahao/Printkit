import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => Promise.resolve({ auth: { getUser: getUserMock } }),
}));

const submitSupportMessageMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/merqo-support", () => ({
  submitSupportMessage: (...args: unknown[]) =>
    submitSupportMessageMock(...args),
}));

import { submitSupportMessageAction } from "./support";

describe("submitSupportMessageAction", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    submitSupportMessageMock.mockClear();
  });

  it("returns an error when the input is invalid", async () => {
    const result = await submitSupportMessageAction({
      category: "printer",
      body: "",
    });
    expect(result.success).toBe(false);
    expect(submitSupportMessageMock).not.toHaveBeenCalled();
  });

  it("returns an error when there's no session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await submitSupportMessageAction({
      category: "printer",
      body: "It won't pair",
    });
    expect(result).toEqual({ success: false, error: "Please sign in first" });
  });

  it("submits the message for the signed-in vendor", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "vendor-1" } } });
    const result = await submitSupportMessageAction({
      category: "printer",
      body: "It won't pair",
    });
    expect(result).toEqual({ success: true });
    expect(submitSupportMessageMock).toHaveBeenCalledWith(
      expect.anything(),
      "printer",
      "It won't pair",
    );
  });
});
