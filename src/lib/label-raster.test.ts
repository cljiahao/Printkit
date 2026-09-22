import { describe, it, expect } from "vitest";
import { buildLabelLayout } from "./label-layout";
import { rasterizeLayout, mmToPx } from "./label-raster";

const layout = buildLabelLayout(
  { customer_name: "Ada", order_number: "67" },
  { widthMm: 50, heightMm: 30 },
);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("mmToPx", () => {
  it("converts millimetres to dots at the given dpi", () => {
    expect(mmToPx(25.4, 203)).toBe(203);
    expect(mmToPx(50, 203)).toBe(400);
    expect(mmToPx(50, 300)).toBe(591);
  });
});

describe("rasterizeLayout", () => {
  it("returns PNG bytes", async () => {
    const png = await rasterizeLayout(layout, 203);
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("sizes the image from the label size and dpi", async () => {
    const png = await rasterizeLayout(layout, 203);
    expect(png.readUInt32BE(16)).toBe(mmToPx(50, 203));
    expect(png.readUInt32BE(20)).toBe(mmToPx(30, 203));
  });

  it("is deterministic for the same layout", async () => {
    const a = await rasterizeLayout(layout, 203);
    const b = await rasterizeLayout(layout, 203);
    expect(a.equals(b)).toBe(true);
  });

  it("renders different content to different bytes", async () => {
    const other = buildLabelLayout(
      { customer_name: "Bo", order_number: "68" },
      { widthMm: 50, heightMm: 30 },
    );
    const a = await rasterizeLayout(layout, 203);
    const b = await rasterizeLayout(other, 203);
    expect(a.equals(b)).toBe(false);
  });

  it("draws a Chinese name rather than leaving it blank", async () => {
    const chinese = buildLabelLayout(
      { customer_name: "陈明", order_number: "70" },
      { widthMm: 50, heightMm: 30 },
    );
    const blank = buildLabelLayout(
      { customer_name: "", order_number: "70" },
      { widthMm: 50, heightMm: 30 },
    );
    const withName = await rasterizeLayout(chinese, 203);
    const withoutName = await rasterizeLayout(blank, 203);
    expect(withName.equals(withoutName)).toBe(false);
  });

  it("emits only pure black and pure white pixels", async () => {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const png = await rasterizeLayout(layout, 203);
    const image = await loadImage(png);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, image.width, image.height);

    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      expect([0, 255]).toContain(data[i]);
      if (data[i] === 0) ink += 1;
    }
    const ratio = ink / (image.width * image.height);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(0.9);
  });
});
