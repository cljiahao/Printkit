// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { JobHistoryTable } from "./job-history-table";
import type { PrintJob } from "@/lib/print-jobs-list";

vi.mock("./actions", () => ({ reprintJob: vi.fn() }));

const JOB: PrintJob = {
  id: "job-1",
  vendor_id: "vendor-1",
  job_type: "label",
  location_id: null,
  payload: { customer_name: "Ada", order_number: "0007" },
  status: "printed",
  source_kit: "qkit",
  source_ref: "order-1",
  created_at: "2026-08-22T10:00:00Z",
  printed_at: "2026-08-22T10:00:05Z",
};

describe("JobHistoryTable", () => {
  it("renders a row per job with customer name, order number, and status", () => {
    render(<JobHistoryTable jobs={[JOB]} />);
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("0007")).toBeInTheDocument();
    expect(screen.getByText("Printed")).toBeInTheDocument();
  });

  it("renders the created timestamp pinned to Asia/Singapore, not the runtime timezone", () => {
    render(<JobHistoryTable jobs={[JOB]} />);
    // JOB.created_at is 2026-08-22T10:00:00Z, which is 6:00 pm in Singapore.
    // A locale-dependent `toLocaleString()` on a UTC-runtime server would
    // show 10:00 am instead.
    expect(screen.getByText("22 Aug 2026, 6:00 pm")).toBeInTheDocument();
  });

  it("shows an empty state when there are no jobs", () => {
    render(<JobHistoryTable jobs={[]} />);
    expect(screen.getByText(/no print jobs yet/i)).toBeInTheDocument();
  });

  it("renders a Reprint button only for a failed job", () => {
    render(<JobHistoryTable jobs={[{ ...JOB, status: "failed" }]} />);
    expect(
      screen.getByRole("button", { name: /reprint/i }),
    ).toBeInTheDocument();
  });

  it("renders no Reprint button for a printed job", () => {
    render(<JobHistoryTable jobs={[JOB]} />);
    expect(
      screen.queryByRole("button", { name: /reprint/i }),
    ).not.toBeInTheDocument();
  });
});
