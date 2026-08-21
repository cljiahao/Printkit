// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Footer } from "./footer";

describe("Footer", () => {
  it("renders the wordmark, tagline, copyright line, and sign-in link matching qkit's single-row layout", () => {
    render(<Footer />);

    expect(screen.getByRole("link", { name: "paykit home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByText("The Merqo family's shared vendor payment engine."),
    ).toBeInTheDocument();
    expect(screen.getByText("© 2026 paykit · a Merqo kit")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Vendor sign in →" }),
    ).toHaveAttribute("href", "/login");
  });
});
