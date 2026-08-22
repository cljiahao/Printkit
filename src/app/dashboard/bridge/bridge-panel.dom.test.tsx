// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/bridge-mode", () => ({
  isBridgeModeEnabled: vi.fn().mockReturnValue(false),
  setBridgeModeEnabled: vi.fn(),
}));
vi.mock("./use-job-delivery", () => ({ useJobDelivery: vi.fn() }));
vi.mock("./use-bridge-presence", () => ({ useBridgePresence: vi.fn() }));
vi.mock("@/lib/niimbot-print", () => ({
  connectPrinter: vi.fn().mockResolvedValue({ deviceName: "B1" }),
  printLabel: vi.fn().mockResolvedValue(undefined),
  disconnectPrinter: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/label-render", () => ({
  renderLabelCanvas: vi.fn().mockReturnValue(document.createElement("canvas")),
}));
vi.mock("./actions", () => ({
  reportPrintResult: vi.fn().mockResolvedValue({ success: true }),
}));

import { isBridgeModeEnabled, setBridgeModeEnabled } from "@/lib/bridge-mode";
import { connectPrinter } from "@/lib/niimbot-print";
import { BridgePanel } from "./bridge-panel";

describe("BridgePanel", () => {
  beforeEach(() => {
    vi.mocked(isBridgeModeEnabled).mockReturnValue(false);
    vi.mocked(setBridgeModeEnabled).mockClear();
  });

  it("renders the Bridge mode toggle off by default", () => {
    render(<BridgePanel vendorId="vendor-1" />);
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("persists enabling Bridge mode via setBridgeModeEnabled", () => {
    render(<BridgePanel vendorId="vendor-1" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(setBridgeModeEnabled).toHaveBeenCalledWith(true);
  });

  it("shows a Pair printer button only once Bridge mode is enabled", () => {
    render(<BridgePanel vendorId="vendor-1" />);
    expect(
      screen.queryByRole("button", { name: /pair printer/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));
    expect(
      screen.getByRole("button", { name: /pair printer/i }),
    ).toBeInTheDocument();
  });

  it("connects the printer when Pair printer is clicked", async () => {
    render(<BridgePanel vendorId="vendor-1" />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: /pair printer/i }));

    await waitFor(() => expect(connectPrinter).toHaveBeenCalled());
    expect(await screen.findByText(/connected/i)).toBeInTheDocument();
  });

  it("shows a Print test button once paired", async () => {
    render(<BridgePanel vendorId="vendor-1" />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: /pair printer/i }));

    expect(
      await screen.findByRole("button", { name: /print test/i }),
    ).toBeInTheDocument();
  });
});
