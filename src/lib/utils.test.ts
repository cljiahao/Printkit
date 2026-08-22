import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime } from "./utils";

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

describe("formatDateTime", () => {
  it("formats an ISO timestamp pinned to Asia/Singapore (UTC+8), not the runtime timezone", () => {
    // 2026-08-22T10:00:00Z is 2026-08-22T18:00:00+08:00 in Singapore. A
    // plain `toLocaleString()` on a UTC-runtime server would show 10:00 am.
    expect(formatDateTime("2026-08-22T10:00:00Z")).toBe("22 Aug 2026, 6:00 pm");
  });

  it("rolls the date forward when the UTC-8 offset crosses midnight", () => {
    // 2026-01-01T16:30:00Z is 2026-01-02T00:30:00+08:00 in Singapore.
    expect(formatDateTime("2026-01-01T16:30:00Z")).toBe("2 Jan 2026, 12:30 am");
  });
});
