// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/vendor-session", () => ({
  getVendorSession: vi
    .fn()
    .mockResolvedValue({ supabase: {}, user: { id: "vendor-1" } }),
}));
vi.mock("./bridge-panel", () => ({
  BridgePanel: ({ vendorId }: { vendorId: string }) => (
    <div>bridge panel for {vendorId}</div>
  ),
}));

import BridgePage from "./page";

describe("BridgePage", () => {
  it("renders the bridge panel for the signed-in vendor", async () => {
    render(await BridgePage());
    expect(screen.getByText("bridge panel for vendor-1")).toBeInTheDocument();
  });
});
