// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/vendor-session", () => ({
  getVendorSession: vi.fn().mockResolvedValue({
    supabase: {},
    user: { id: "vendor-1", email: "vendor@test.dev", user_metadata: {} },
  }),
}));
vi.mock("@/lib/merqo-vendor-profile", () => ({
  getOrCreateVendorProfile: vi
    .fn()
    .mockResolvedValue({ stall_name: "Ada's Prints" }),
}));
vi.mock("@/app/actions/auth", () => ({ signOutAction: vi.fn() }));
vi.mock("./dashboard-nav", () => ({
  DashboardNav: ({ vendorName }: { vendorName: string }) => (
    <div>{vendorName}</div>
  ),
}));

import DashboardLayout from "./layout";

describe("DashboardLayout", () => {
  it("renders the nav with the vendor's stall name and the page content", async () => {
    render(await DashboardLayout({ children: <p>page content</p> }));
    expect(screen.getByText("Ada's Prints")).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });
});
