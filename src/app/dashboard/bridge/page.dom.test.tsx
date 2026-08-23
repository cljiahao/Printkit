// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/vendor-session", () => ({
  getVendorSession: vi
    .fn()
    .mockResolvedValue({ supabase: {}, user: { id: "vendor-1" } }),
}));
vi.mock("@/lib/print-locations", () => ({
  listActiveLocations: vi.fn(),
}));
vi.mock("./bridge-panel", () => ({
  BridgePanel: ({
    vendorId,
    locationId,
  }: {
    vendorId: string;
    locationId: string;
  }) => (
    <div>
      bridge panel for {vendorId} at {locationId}
    </div>
  ),
}));

import { listActiveLocations } from "@/lib/print-locations";
import BridgePage from "./page";

describe("BridgePage", () => {
  beforeEach(() => {
    vi.mocked(listActiveLocations).mockClear();
  });

  it("auto-selects the single active location and renders the bridge panel", async () => {
    vi.mocked(listActiveLocations).mockResolvedValue([
      { id: "loc-1", label: "Kopitiam Cart" },
    ]);
    render(await BridgePage());
    expect(
      screen.getByText("bridge panel for vendor-1 at loc-1"),
    ).toBeInTheDocument();
  });

  it("shows a message directing the vendor to qkit's booth settings when there are no active locations", async () => {
    vi.mocked(listActiveLocations).mockResolvedValue([]);
    render(await BridgePage());
    expect(
      screen.getByText(/no booths have printing enabled yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/bridge panel for/)).not.toBeInTheDocument();
  });

  it("renders a picker for multiple active locations and shows the bridge panel once one is picked", async () => {
    vi.mocked(listActiveLocations).mockResolvedValue([
      { id: "loc-1", label: "Kopitiam Cart" },
      { id: "loc-2", label: "Ice Cream Cart" },
    ]);
    render(await BridgePage());

    expect(screen.queryByText(/bridge panel for/)).not.toBeInTheDocument();
    expect(screen.getByText("Ice Cream Cart")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Ice Cream Cart"));

    expect(
      screen.getByText("bridge panel for vendor-1 at loc-2"),
    ).toBeInTheDocument();
  });
});
