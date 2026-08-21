import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUserMock, redirectMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => Promise.resolve({ auth: { getUser: getUserMock } }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { getVendorSession } from "./vendor-session";

describe("getVendorSession", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    redirectMock.mockReset();
  });

  it("returns the session when a user is authenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "vendor-1" } } });
    const session = await getVendorSession();
    expect(session.user.id).toBe("vendor-1");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await getVendorSession();
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
