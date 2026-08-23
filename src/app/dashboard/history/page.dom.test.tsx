// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/vendor-session", () => ({
  getVendorSession: vi.fn().mockResolvedValue({
    supabase: {},
    user: { id: "vendor-1" },
  }),
}));
vi.mock("@/lib/print-jobs-list", () => ({
  listPrintJobs: vi.fn().mockResolvedValue([
    {
      id: "job-1",
      vendor_id: "vendor-1",
      job_type: "label",
      location_id: "loc-1",
      print_locations: { label: "Kopitiam Cart" },
      payload: { customer_name: "Ada", order_number: "0007" },
      status: "printed",
      source_kit: "qkit",
      source_ref: "order-1",
      created_at: "2026-08-22T10:00:00Z",
      printed_at: "2026-08-22T10:00:05Z",
    },
    {
      id: "job-2",
      vendor_id: "vendor-1",
      job_type: "label",
      location_id: null,
      print_locations: null,
      payload: { customer_name: "Uma", order_number: "0008" },
      status: "queued",
      source_kit: "qkit",
      source_ref: "order-2",
      created_at: "2026-08-22T11:00:00Z",
      printed_at: null,
    },
  ]),
}));
vi.mock("@/lib/print-locations", () => ({
  listActiveLocations: vi.fn().mockResolvedValue([]),
}));

import HistoryPage from "./page";

describe("HistoryPage", () => {
  it("renders the vendor's job history", async () => {
    render(await HistoryPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("renders every row when the unrouted filter isn't applied", async () => {
    render(await HistoryPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Uma")).toBeInTheDocument();
  });

  it("renders only unrouted, queued rows when ?unrouted=1 is present", async () => {
    render(
      await HistoryPage({ searchParams: Promise.resolve({ unrouted: "1" }) }),
    );
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    expect(screen.getByText("Uma")).toBeInTheDocument();
  });
});
