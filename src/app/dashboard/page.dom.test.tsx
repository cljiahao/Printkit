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
vi.mock("@/lib/location-printer-summaries", () => ({
  listLocationPrinterSummaries: vi.fn().mockResolvedValue([]),
}));

import { listLocationPrinterSummaries } from "@/lib/location-printer-summaries";
import { countUnroutedJobs } from "@/lib/print-jobs-list";
import DashboardPage from "./page";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.mocked(listLocationPrinterSummaries).mockReset().mockResolvedValue([]);
    vi.mocked(countUnroutedJobs).mockReset().mockResolvedValue(0);
  });

  it("reports each booth's printer and its live state", async () => {
    vi.mocked(listLocationPrinterSummaries).mockResolvedValue([
      {
        location: {
          id: "loc-1",
          label: "Kopitiam Cart",
          source_ref: "booth-1",
        },
        printer: {
          location_id: "loc-1",
          display_name: "Feie FP-N20H",
          connector: "vendor_cloud",
          catalog_id: "feie-fp-n20h",
          last_seen_at: new Date().toISOString(),
        },
        state: "online",
      },
      {
        location: {
          id: "loc-2",
          label: "Ice Cream Cart",
          source_ref: "booth-2",
        },
        printer: null,
        state: "not_set_up",
      },
    ]);

    render(await DashboardPage());

    expect(screen.getByText("Kopitiam Cart")).toBeInTheDocument();
    expect(screen.getByText("Feie FP-N20H")).toBeInTheDocument();
    expect(screen.getByText(/printer connected/i)).toBeInTheDocument();
    expect(screen.getByText("Ice Cream Cart")).toBeInTheDocument();
    expect(screen.getByText(/no printer yet/i)).toBeInTheDocument();
    expect(screen.getByText(/connected to qkit/i)).toBeInTheDocument();
  });

  it("reports a printer that has gone quiet as offline", async () => {
    vi.mocked(listLocationPrinterSummaries).mockResolvedValue([
      {
        location: {
          id: "loc-1",
          label: "Kopitiam Cart",
          source_ref: "booth-1",
        },
        printer: {
          location_id: "loc-1",
          display_name: "Star mC-Label2",
          connector: "cloud_poll",
          catalog_id: "star-mc-label2",
          last_seen_at: "2026-01-01T16:30:00Z",
        },
        state: "offline",
      },
    ]);

    render(await DashboardPage());

    expect(screen.getByText(/offline since/i)).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no active locations", async () => {
    vi.mocked(listLocationPrinterSummaries).mockResolvedValue([]);
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
