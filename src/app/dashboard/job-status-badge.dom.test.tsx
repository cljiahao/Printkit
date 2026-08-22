// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JobStatusBadge } from "./job-status-badge";

describe("JobStatusBadge", () => {
  it.each([
    ["queued", "Queued"],
    ["sent", "Sent"],
    ["printed", "Printed"],
    ["failed", "Failed"],
  ] as const)("renders the %s label", (status, label) => {
    render(<JobStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
