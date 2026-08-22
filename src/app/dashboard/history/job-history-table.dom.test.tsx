// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JobHistoryTable } from "./job-history-table";
import type { PrintJob } from "@/lib/print-jobs-list";

const JOB: PrintJob = {
  id: "job-1",
  vendor_id: "vendor-1",
  job_type: "label",
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

  it("shows an empty state when there are no jobs", () => {
    render(<JobHistoryTable jobs={[]} />);
    expect(screen.getByText(/no print jobs yet/i)).toBeInTheDocument();
  });
});
