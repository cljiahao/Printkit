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
vi.mock("@/lib/printers", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/printers")>("@/lib/printers");
  return { ...actual, getPrinterByLocation: vi.fn() };
});

import { listActiveLocations } from "@/lib/print-locations";
import { countUnroutedJobs } from "@/lib/print-jobs-list";
import { getPrinterByLocation } from "@/lib/printers";
import DashboardPage from "./page";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.mocked(listActiveLocations).mockReset().mockResolvedValue([]);
    vi.mocked(countUnroutedJobs).mockReset().mockResolvedValue(0);
    vi.mocked(getPrinterByLocation).mockReset().mockResolvedValue(null);
  });

  it("reports each booth's printer and its live state", async () => {
    vi.mocked(listActiveLocations).mockResolvedValue([
      { id: "loc-1", label: "Kopitiam Cart", source_ref: "booth-1" },
      { id: "loc-2", label: "Ice Cream Cart", source_ref: "booth-2" },
    ]);
    vi.mocked(getPrinterByLocation).mockImplementation(async (locationId) =>
      locationId === "loc-1"
        ? ({
            id: "printer-1",
            display_name: "Feie FP-N20H",
            last_seen_at: new Date().toISOString(),
          } as Awaited<ReturnType<typeof getPrinterByLocation>>)
        : null,
    );

    render(await DashboardPage());

    expect(screen.getByText("Kopitiam Cart")).toBeInTheDocument();
    expect(screen.getByText("Feie FP-N20H")).toBeInTheDocument();
    expect(screen.getByText(/printer connected/i)).toBeInTheDocument();
    expect(screen.getByText("Ice Cream Cart")).toBeInTheDocument();
    expect(screen.getByText(/no printer yet/i)).toBeInTheDocument();
    expect(screen.getByText(/connected to qkit/i)).toBeInTheDocument();
  });

  it("reports a printer that has gone quiet as offline", async () => {
    vi.mocked(listActiveLocations).mockResolvedValue([
      { id: "loc-1", label: "Kopitiam Cart", source_ref: "booth-1" },
    ]);
    vi.mocked(getPrinterByLocation).mockResolvedValue({
      id: "printer-1",
      display_name: "Star mC-Label2",
      last_seen_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    } as Awaited<ReturnType<typeof getPrinterByLocation>>);

    render(await DashboardPage());

    expect(screen.getByText(/offline since/i)).toBeInTheDocument();
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
