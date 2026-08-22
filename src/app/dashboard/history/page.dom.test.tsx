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
      payload: { customer_name: "Ada", order_number: "0007" },
      status: "printed",
      source_kit: "qkit",
      source_ref: "order-1",
      created_at: "2026-08-22T10:00:00Z",
      printed_at: "2026-08-22T10:00:05Z",
    },
  ]),
}));

import HistoryPage from "./page";

describe("HistoryPage", () => {
  it("renders the vendor's job history", async () => {
    render(await HistoryPage());
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });
});
