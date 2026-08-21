import { describe, it, expect } from "vitest";
import { formatCents, formatDate } from "./utils";

describe("formatCents", () => {
  it("formats whole dollars", () => {
    expect(formatCents(500)).toBe("$5.00");
  });

  it("formats an amount with cents", () => {
    expect(formatCents(450)).toBe("$4.50");
  });

  it("formats zero", () => {
    expect(formatCents(0)).toBe("$0.00");
  });
});

describe("formatDate", () => {
  it("formats an ISO date string (en-SG: day/month/year)", () => {
    expect(formatDate("2026-12-01")).toBe("01/12/2026");
  });

  it("never shifts a day-boundary date backward regardless of local time zone", () => {
    // Any implementation that parses without an explicit UTC anchor (e.g.
    // `new Date("2026-01-01")` interpreted in a negative-offset local zone)
    // would render this as 2025-12-31 instead.
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
  });
});
