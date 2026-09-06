// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LegalAcceptPage from "./page";

describe("LegalAcceptPage", () => {
  it("renders the interstitial with a hidden safe-redirect next value", async () => {
    render(
      await LegalAcceptPage({
        searchParams: Promise.resolve({ next: "/admin" }),
      }),
    );
    expect(screen.getByText("Our terms have been updated")).toBeInTheDocument();
    const nextField = document.querySelector('input[name="next"]');
    expect(nextField).toHaveValue("/admin");
  });

  it("falls back to /dashboard for an unsafe next value", async () => {
    render(
      await LegalAcceptPage({
        searchParams: Promise.resolve({ next: "https://evil.example" }),
      }),
    );
    const nextField = document.querySelector('input[name="next"]');
    expect(nextField).toHaveValue("/dashboard");
  });
});
