import { describe, it, expect } from "vitest";
import { buildLabelLayout, MAX_LABEL_CHARS } from "./label-layout";

const size = { widthMm: 50, heightMm: 30 };

describe("buildLabelLayout", () => {
  it("places the order number and the customer name", () => {
    const layout = buildLabelLayout(
      { customer_name: "Ada", order_number: "67" },
      size,
    );

    expect(layout.widthMm).toBe(50);
    expect(layout.heightMm).toBe(30);
    const texts = layout.elements.map((el) =>
      el.kind === "text" ? el.text : "",
    );
    expect(texts).toContain("#67");
    expect(texts).toContain("Ada");
  });

  it("prints the order number larger than the name", () => {
    const layout = buildLabelLayout(
      { customer_name: "Ada", order_number: "67" },
      size,
    );
    const order = layout.elements.find(
      (el) => el.kind === "text" && el.text === "#67",
    );
    const name = layout.elements.find(
      (el) => el.kind === "text" && el.text === "Ada",
    );
    expect(order?.kind === "text" && order.size).toBe("xl");
    expect(name?.kind === "text" && name.size).toBe("md");
  });

  it("truncates an over-long name instead of overflowing the label", () => {
    const layout = buildLabelLayout(
      { customer_name: "a".repeat(40), order_number: "1" },
      size,
    );
    const name = layout.elements.find(
      (el) => el.kind === "text" && el.text !== "#1",
    );
    expect(name?.kind === "text" && name.text.length).toBe(MAX_LABEL_CHARS);
    expect(name?.kind === "text" && name.text.endsWith("…")).toBe(true);
  });

  it("falls back to readable placeholders on a missing payload", () => {
    const layout = buildLabelLayout({}, size);
    const texts = layout.elements.map((el) =>
      el.kind === "text" ? el.text : "",
    );
    expect(texts).toContain("#?");
    expect(texts).toContain("Customer");
  });

  it("treats a blank name the same as a missing one", () => {
    const layout = buildLabelLayout(
      { customer_name: "   ", order_number: "5" },
      size,
    );
    const texts = layout.elements.map((el) =>
      el.kind === "text" ? el.text : "",
    );
    expect(texts).toContain("Customer");
  });

  it("keeps every element inside the label bounds", () => {
    const layout = buildLabelLayout(
      { customer_name: "Ada", order_number: "67" },
      size,
    );
    for (const el of layout.elements) {
      expect(el.xMm).toBeGreaterThanOrEqual(0);
      expect(el.xMm).toBeLessThanOrEqual(layout.widthMm);
      expect(el.yMm).toBeGreaterThanOrEqual(0);
      expect(el.yMm).toBeLessThanOrEqual(layout.heightMm);
    }
  });

  it("scales element positions with the label size", () => {
    const small = buildLabelLayout({ order_number: "1" }, size);
    const large = buildLabelLayout(
      { order_number: "1" },
      { widthMm: 60, heightMm: 40 },
    );
    expect(large.elements[0].xMm).toBeGreaterThan(small.elements[0].xMm);
    expect(large.elements[0].yMm).toBeGreaterThan(small.elements[0].yMm);
  });
});
