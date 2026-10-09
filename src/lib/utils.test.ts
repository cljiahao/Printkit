import { describe, it, expect } from "vitest";
import { formatDateTime } from "./utils";

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
