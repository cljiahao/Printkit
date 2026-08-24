// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/vendor-session", () => ({
  getVendorSession: vi
    .fn()
    .mockResolvedValue({ supabase: {}, user: { id: "vendor-1" } }),
}));
vi.mock("@/lib/print-jobs-list", () => ({
  listPrintJobs: vi.fn().mockResolvedValue([]),
  countUnroutedJobs: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/print-locations", () => ({
  listActiveLocations: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/components/bridge-status", () => ({
  BridgeStatus: ({
    vendorId,
    locationId,
  }: {
    vendorId: string;
    locationId: string;
  }) => (
    <div>
      bridge status for {vendorId} at {locationId}
    </div>
  ),
}));

import { listActiveLocations } from "@/lib/print-locations";
import { countUnroutedJobs } from "@/lib/print-jobs-list";
import DashboardPage from "./page";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.mocked(listActiveLocations).mockReset().mockResolvedValue([]);
    vi.mocked(countUnroutedJobs).mockReset().mockResolvedValue(0);
  });

  it("renders a bridge status per active location and a qkit-connected info card", async () => {
    vi.mocked(listActiveLocations).mockResolvedValue([
      { id: "loc-1", label: "Kopitiam Cart", source_ref: "booth-1" },
      { id: "loc-2", label: "Ice Cream Cart", source_ref: "booth-2" },
    ]);
    render(await DashboardPage());
    expect(
      screen.getByText("bridge status for vendor-1 at loc-1"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("bridge status for vendor-1 at loc-2"),
    ).toBeInTheDocument();
    expect(screen.getByText(/connected to qkit/i)).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no active locations", async () => {
    vi.mocked(listActiveLocations).mockResolvedValue([]);
    render(await DashboardPage());
    expect(
      screen.getByText(/no booths have printing enabled yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/bridge status for/)).not.toBeInTheDocument();
  });

  it("shows the empty history state when there are no recent jobs", async () => {
    render(await DashboardPage());
    expect(screen.getByText(/no print jobs yet/i)).toBeInTheDocument();
  });

  it("hides the unrouted-jobs callout when the count is zero", async () => {
    vi.mocked(countUnroutedJobs).mockResolvedValue(0);
    render(await DashboardPage());
    expect(screen.queryByText(/unrouted print job/i)).not.toBeInTheDocument();
  });

  it("shows the unrouted-jobs callout linking to filtered history when the count is positive", async () => {
    vi.mocked(countUnroutedJobs).mockResolvedValue(3);
    render(await DashboardPage());
    const link = screen.getByText(/3 unrouted print jobs/i);
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "/dashboard/history?unrouted=1",
    );
  });
});
