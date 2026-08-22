import { describe, it, expect } from "vitest";
import {
  computeLabelLayout,
  LABEL_WIDTH_PX,
  LABEL_HEIGHT_PX,
} from "./label-render";

describe("computeLabelLayout", () => {
  it("lays out the customer name and order number as two lines", () => {
    const lines = computeLabelLayout(
      { customerName: "Ada", orderNumber: "0007" },
      LABEL_WIDTH_PX,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("Ada");
    expect(lines[1].text).toBe("#0007");
  });

  it("keeps every line's x within the label width", () => {
    const lines = computeLabelLayout(
      { customerName: "Ada", orderNumber: "0007" },
      LABEL_WIDTH_PX,
    );
    for (const line of lines) {
      expect(line.x).toBeGreaterThanOrEqual(0);
      expect(line.x).toBeLessThanOrEqual(LABEL_WIDTH_PX);
    }
  });

  it("truncates a customer name too long to fit rather than overflowing the label", () => {
    const longName = "A".repeat(200);
    const lines = computeLabelLayout(
      { customerName: longName, orderNumber: "0001" },
      LABEL_WIDTH_PX,
    );
    expect(lines[0].text.length).toBeLessThan(200);
    expect(lines[0].text.endsWith("…")).toBe(true);
  });

  it("falls back to a placeholder when the customer name is blank", () => {
    const lines = computeLabelLayout(
      { customerName: "", orderNumber: "0001" },
      LABEL_WIDTH_PX,
    );
    expect(lines[0].text).toBe("Customer");
  });

  it("exports the B1's real printhead width and a fixed label height", () => {
    expect(LABEL_WIDTH_PX).toBe(384);
    expect(LABEL_HEIGHT_PX).toBeGreaterThan(0);
  });
});
