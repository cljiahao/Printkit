import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUserMock, redirectMock, requireCurrentLegalAcceptanceMock } =
  vi.hoisted(() => ({
    getUserMock: vi.fn(),
    redirectMock: vi.fn(() => {
      throw new Error("NEXT_REDIRECT");
    }),
    requireCurrentLegalAcceptanceMock: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => Promise.resolve({ auth: { getUser: getUserMock } }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/legal-gate", () => ({
  requireCurrentLegalAcceptance: requireCurrentLegalAcceptanceMock,
}));

import { getVendorSession } from "./vendor-session";

describe("getVendorSession", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    redirectMock.mockReset();
    requireCurrentLegalAcceptanceMock.mockReset().mockResolvedValue(undefined);
  });

  it("returns the session when a user is authenticated", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "vendor-1", email: "vendor@test.dev" } },
    });
    const session = await getVendorSession();
    expect(session.user.id).toBe("vendor-1");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await expect(getVendorSession()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(requireCurrentLegalAcceptanceMock).not.toHaveBeenCalled();
  });

  it("passes the signed-in vendor's email through the legal-acceptance gate", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "vendor-1", email: "vendor@test.dev" } },
    });

    await getVendorSession();

    expect(requireCurrentLegalAcceptanceMock).toHaveBeenCalledWith(
      "vendor@test.dev",
    );
  });

  it("bounces to /legal/accept when the gate redirects (stale acceptance)", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "vendor-1", email: "vendor@test.dev" } },
    });
    requireCurrentLegalAcceptanceMock.mockRejectedValue(
      new Error("NEXT_REDIRECT"),
    );

    await expect(getVendorSession()).rejects.toThrow("NEXT_REDIRECT");
  });
});
