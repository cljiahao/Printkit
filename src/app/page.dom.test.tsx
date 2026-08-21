// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Home", () => {
  it("renders the printkit heading", () => {
    render(<Home />);
    expect(screen.getByText("printkit")).toBeInTheDocument();
  });
});
