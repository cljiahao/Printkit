// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/vendor-session", () => ({
  getVendorSession: vi
    .fn()
    .mockResolvedValue({ supabase: {}, user: { id: "vendor-1" } }),
}));
vi.mock("@/lib/print-jobs-list", () => ({
  listPrintJobs: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/components/bridge-status", () => ({
  BridgeStatus: ({ vendorId }: { vendorId: string }) => (
    <div>bridge status for {vendorId}</div>
  ),
}));

import DashboardPage from "./page";

describe("DashboardPage", () => {
  it("renders the bridge status and a qkit-connected info card", async () => {
    render(await DashboardPage());
    expect(screen.getByText("bridge status for vendor-1")).toBeInTheDocument();
    expect(screen.getByText(/connected to qkit/i)).toBeInTheDocument();
  });

  it("shows the empty history state when there are no recent jobs", async () => {
    render(await DashboardPage());
    expect(screen.getByText(/no print jobs yet/i)).toBeInTheDocument();
  });
});
