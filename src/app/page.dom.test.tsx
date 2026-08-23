import { describe, it, expect, vi, beforeEach } from "vitest";

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import Home from "./page";

describe("Home", () => {
  beforeEach(() => {
    redirectMock.mockReset();
  });

  it("redirects to /dashboard", () => {
    Home();
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });
});
