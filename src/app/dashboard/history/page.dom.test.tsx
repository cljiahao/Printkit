// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/vendor-session", () => ({
  getVendorSession: vi.fn().mockResolvedValue({
    supabase: {},
    user: { id: "vendor-1" },
  }),
}));
vi.mock("@/lib/print-history", () => ({
  listPrintHistoryPage: vi
    .fn()
    .mockImplementation(async (_client, _vendor, options) => ({
      nextCursor: null,
      jobs: [
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
      ].filter(
        (job) =>
          !options.unrouted ||
          (job.location_id === null && job.status === "queued"),
      ),
    })),
}));
vi.mock("@/lib/print-locations", () => ({
  listActiveLocations: vi.fn().mockResolvedValue([]),
}));

import { listPrintHistoryPage } from "@/lib/print-history";
import HistoryPage from "./page";

describe("HistoryPage", () => {
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

it("preserves the unrouted filter when browsing older jobs", async () => {
  vi.mocked(listPrintHistoryPage).mockResolvedValueOnce({
    jobs: [],
    nextCursor: "next-page",
  });
  render(
    await HistoryPage({ searchParams: Promise.resolve({ unrouted: "1" }) }),
  );
  expect(screen.getByRole("link", { name: "Older jobs" })).toHaveAttribute(
    "href",
    "/dashboard/history?unrouted=1&cursor=next-page",
  );
});

it("offers a return to the newest filtered page", async () => {
  render(
    await HistoryPage({
      searchParams: Promise.resolve({ unrouted: "1", cursor: "current-page" }),
    }),
  );
  expect(screen.getByRole("link", { name: "Newest jobs" })).toHaveAttribute(
    "href",
    "/dashboard/history?unrouted=1",
  );
  expect(listPrintHistoryPage).toHaveBeenLastCalledWith({}, "vendor-1", {
    unrouted: true,
    cursor: "current-page",
  });
});
