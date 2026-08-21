// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BackButton } from "./back-button";

describe("BackButton", () => {
  it("renders a link to the given href showing the given label", () => {
    render(<BackButton href="/dashboard" label="Dashboard" />);
    const link = screen.getByRole("link", { name: "Dashboard" });
    expect(link).toHaveAttribute("href", "/dashboard");
  });

  it("renders the leave-page arrow icon alongside the label", () => {
    render(<BackButton href="/dashboard/plan" label="Plan" />);
    const link = screen.getByRole("link", { name: "Plan" });
    expect(link.querySelector("svg")).toBeInTheDocument();
  });
});
