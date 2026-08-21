// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BackToTop } from "./back-to-top";

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  mockMatchMedia(false);
  window.scrollTo = vi.fn();
  Object.defineProperty(window, "scrollY", {
    value: 0,
    writable: true,
    configurable: true,
  });
});

describe("BackToTop", () => {
  it("stays hidden until the page scrolls past the threshold, then appears", () => {
    render(<BackToTop />);
    const button = screen.getByRole("button", { name: "Back to top" });
    expect(button).toHaveClass("opacity-0", "pointer-events-none");

    Object.defineProperty(window, "scrollY", {
      value: 700,
      configurable: true,
    });
    fireEvent.scroll(window);

    expect(button).toHaveClass("opacity-100");
  });

  it("scrolls to top smoothly on click, respecting reduced motion", () => {
    render(<BackToTop />);
    fireEvent.click(screen.getByRole("button", { name: "Back to top" }));
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });

    mockMatchMedia(true);
    fireEvent.click(screen.getByRole("button", { name: "Back to top" }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });
});
