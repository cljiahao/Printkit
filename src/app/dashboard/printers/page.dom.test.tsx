// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const summaries = vi.hoisted(() => vi.fn());
vi.mock("@/lib/vendor-session", () => ({
  getVendorSession: async () => ({ user: { id: "vendor-a" } }),
}));
vi.mock("@/lib/location-printer-summaries", () => ({
  listLocationPrinterSummaries: summaries,
}));
import PrintersPage from "./page";
it("shows setup links and live status from the scoped summaries", async () => {
  summaries.mockResolvedValue([
    {
      location: { id: "a", label: "A", source_ref: "booth-a" },
      printer: null,
      state: "not_set_up",
    },
    {
      location: { id: "b", label: "B", source_ref: "booth-b" },
      printer: {
        display_name: "Printer B",
        connector: "bridge",
        catalog_id: "niimbot-b1",
        last_seen_at: null,
      },
      state: "offline",
    },
  ]);
  render(await PrintersPage());
  expect(summaries).toHaveBeenCalledWith("vendor-a");
  expect(
    screen.getByRole("link", { name: "Choose a printer" }),
  ).toHaveAttribute("href", "/dashboard/printers/new?location=a");
  expect(
    screen.getByRole("link", { name: "Open bridge mode" }),
  ).toHaveAttribute("href", "/dashboard/bridge?booth=booth-b");
  expect(screen.getByText("Printer B")).toBeInTheDocument();
  expect(screen.getByText("Offline")).toBeInTheDocument();
});
it("directs vendors without active booths to qkit", async () => {
  summaries.mockResolvedValue([]);
  render(await PrintersPage());
  expect(
    screen.getByText(/No booths have printing enabled/),
  ).toBeInTheDocument();
});
