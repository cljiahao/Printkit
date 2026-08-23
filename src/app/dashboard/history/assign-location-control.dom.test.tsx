// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const assignPrintLocationMock = vi.fn();
vi.mock("./actions", () => ({
  assignPrintLocation: (...args: unknown[]) => assignPrintLocationMock(...args),
}));

import { AssignLocationControl } from "./assign-location-control";

describe("AssignLocationControl", () => {
  it("renders nothing when there are no active locations", () => {
    const { container } = render(
      <AssignLocationControl jobId="job-1" locations={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a one-click Assign-to button for exactly one active location", async () => {
    assignPrintLocationMock.mockResolvedValue({ ok: true });
    render(
      <AssignLocationControl
        jobId="job-1"
        locations={[{ id: "loc-1", label: "Kopitiam Cart" }]}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Assign to Kopitiam Cart" }),
    );
    await waitFor(() =>
      expect(assignPrintLocationMock).toHaveBeenCalledWith("job-1", "loc-1"),
    );
  });

  it("keeps the confirm button disabled until a booth is picked, for 2+ locations", () => {
    render(
      <AssignLocationControl
        jobId="job-1"
        locations={[
          { id: "loc-1", label: "Kopitiam Cart" },
          { id: "loc-2", label: "Ice Cream Cart" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Assign" })).toBeDisabled();
  });

  it("calls assignPrintLocation with the picked location after select-and-confirm", async () => {
    assignPrintLocationMock.mockResolvedValue({ ok: true });
    render(
      <AssignLocationControl
        jobId="job-1"
        locations={[
          { id: "loc-1", label: "Kopitiam Cart" },
          { id: "loc-2", label: "Ice Cream Cart" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Ice Cream Cart"));
    const confirmButton = screen.getByRole("button", { name: "Assign" });
    expect(confirmButton).not.toBeDisabled();
    fireEvent.click(confirmButton);
    await waitFor(() =>
      expect(assignPrintLocationMock).toHaveBeenCalledWith("job-1", "loc-2"),
    );
  });
});
