// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LocationPicker } from "./location-picker";

describe("LocationPicker", () => {
  it("renders one button per location and calls onSelect with its id", () => {
    const onSelect = vi.fn();
    render(
      <LocationPicker
        locations={[
          { id: "loc-1", label: "Kopitiam Cart" },
          { id: "loc-2", label: "Ice Cream Cart" },
        ]}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText("Ice Cream Cart"));
    expect(onSelect).toHaveBeenCalledWith("loc-2");
  });
});
