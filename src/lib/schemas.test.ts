import { describe, it, expect } from "vitest";
import {
  feedbackSchema,
  supportMessageSchema,
  SUPPORT_CATEGORY_LABELS,
} from "./schemas";

describe("feedbackSchema", () => {
  it("accepts an nps score with no message", () => {
    expect(feedbackSchema.safeParse({ nps: 8 }).success).toBe(true);
  });
  it("rejects an out-of-range nps score", () => {
    expect(feedbackSchema.safeParse({ nps: 11 }).success).toBe(false);
  });
});

describe("supportMessageSchema", () => {
  it("accepts a known category and non-empty body", () => {
    expect(
      supportMessageSchema.safeParse({
        category: "printer",
        body: "It won't pair",
      }).success,
    ).toBe(true);
  });
  it("rejects an empty body", () => {
    expect(
      supportMessageSchema.safeParse({ category: "other", body: "" }).success,
    ).toBe(false);
  });
  it("has a label for every category", () => {
    for (const key of Object.keys(SUPPORT_CATEGORY_LABELS)) {
      expect(
        supportMessageSchema.safeParse({ category: key, body: "x" }).success,
      ).toBe(true);
    }
  });
});
