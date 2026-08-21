import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { getUser, createServerClient } = vi.hoisted(() => {
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } });
  const createServerClient = vi.fn();
  return { getUser, createServerClient };
});
vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { updateSession } from "./middleware";

describe("updateSession", () => {
  beforeEach(() => {
    createServerClient.mockImplementation(() => ({ auth: { getUser } }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes through an unprotected path without checking auth", async () => {
    const request = new NextRequest("https://printkit.merqo.io/login");

    const response = await updateSession(request);

    expect(response.status).toBe(200);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("allows an authenticated user through on a protected path", async () => {
    const request = new NextRequest("https://printkit.merqo.io/dashboard");

    const response = await updateSession(request);

    expect(response.status).toBe(200);
    expect(getUser).toHaveBeenCalled();
  });

  it("redirects to /login when there is no authenticated user on a protected path", async () => {
    createServerClient.mockImplementation(() => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    }));
    const request = new NextRequest("https://printkit.merqo.io/dashboard");

    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://printkit.merqo.io/login",
    );
  });

  it("redirects to /login when getUser throws", async () => {
    createServerClient.mockImplementation(() => ({
      auth: {
        getUser: vi.fn().mockRejectedValue(new Error("network error")),
      },
    }));
    const request = new NextRequest("https://printkit.merqo.io/dashboard");

    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://printkit.merqo.io/login",
    );
  });
});
