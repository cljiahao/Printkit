// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn().mockReturnValue("/dashboard"),
}));

import { DashboardNav } from "./dashboard-nav";

describe("DashboardNav", () => {
  it("renders the printkit wordmark and vendor name", () => {
    render(<DashboardNav signOut={vi.fn()} vendorName="Ada's Prints" />);
    expect(screen.getByText("printkit")).toBeInTheDocument();
    expect(screen.getAllByText("Ada's Prints").length).toBeGreaterThan(0);
  });
});
