// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { PrinterStatusRow } from "./printer-status-row";
it("pins an offline timestamp to Singapore across a UTC date boundary", () => {
  render(
    <PrinterStatusRow
      label="A"
      printerName="B"
      state="offline"
      lastSeenAt="2026-01-01T16:30:00Z"
    />,
  );
  expect(
    screen.getByText("Offline since 2 Jan 2026, 12:30 am"),
  ).toBeInTheDocument();
});
