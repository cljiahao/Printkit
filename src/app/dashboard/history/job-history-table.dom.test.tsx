// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JobHistoryTable } from "./job-history-table";
import type { PrintJob } from "@/lib/print-jobs-list";

const assignPrintLocationMock = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({
  reprintJob: vi.fn(),
  assignPrintLocation: (...args: unknown[]) => assignPrintLocationMock(...args),
}));

const JOB: PrintJob = {
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
};

const UNROUTED_JOB: PrintJob = {
  ...JOB,
  id: "job-2",
  location_id: null,
  print_locations: null,
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

  it("shows the booth label for a routed job", () => {
    render(<JobHistoryTable jobs={[JOB]} />);
    expect(screen.getByText("Kopitiam Cart")).toBeInTheDocument();
  });

  it("shows Unrouted for a job with no location_id", () => {
    render(<JobHistoryTable jobs={[UNROUTED_JOB]} />);
    expect(screen.getByText("Unrouted")).toBeInTheDocument();
  });

  it("shows no assign control for an unrouted job when there are no active locations", () => {
    render(<JobHistoryTable jobs={[UNROUTED_JOB]} locations={[]} />);
    expect(
      screen.queryByRole("button", { name: /assign/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a one-click assign button for an unrouted job with exactly one active location", async () => {
    assignPrintLocationMock.mockResolvedValue({ ok: true });
    render(
      <JobHistoryTable
        jobs={[UNROUTED_JOB]}
        locations={[{ id: "loc-1", label: "Kopitiam Cart" }]}
      />,
    );
    const button = screen.getByRole("button", {
      name: "Assign to Kopitiam Cart",
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(assignPrintLocationMock).toHaveBeenCalledWith("job-2", "loc-1"),
    );
  });

  it("shows a select-and-confirm control for an unrouted job with 2+ active locations", async () => {
    assignPrintLocationMock.mockResolvedValue({ ok: true });
    render(
      <JobHistoryTable
        jobs={[UNROUTED_JOB]}
        locations={[
          { id: "loc-1", label: "Kopitiam Cart" },
          { id: "loc-2", label: "Ice Cream Cart" },
        ]}
      />,
    );
    // The Assign confirm button starts disabled until a booth is picked.
    const confirmButton = screen.getByRole("button", { name: "Assign" });
    expect(confirmButton).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /assign to/i }),
    ).not.toBeInTheDocument();
  });

  it("calls assignPrintLocation with the chosen booth after select-and-confirm", async () => {
    assignPrintLocationMock.mockResolvedValue({ ok: true });
    render(
      <JobHistoryTable
        jobs={[UNROUTED_JOB]}
        locations={[
          { id: "loc-1", label: "Kopitiam Cart" },
          { id: "loc-2", label: "Ice Cream Cart" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Ice Cream Cart"));
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    await waitFor(() =>
      expect(assignPrintLocationMock).toHaveBeenCalledWith("job-2", "loc-2"),
    );
  });

  it("does not render an assign control for a routed job even with active locations", () => {
    render(
      <JobHistoryTable
        jobs={[JOB]}
        locations={[{ id: "loc-1", label: "Kopitiam Cart" }]}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /assign/i }),
    ).not.toBeInTheDocument();
  });
});
