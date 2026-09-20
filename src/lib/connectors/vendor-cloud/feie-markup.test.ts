import { describe, it, expect } from "vitest";
import { buildLabelLayout } from "@/lib/label-layout";
import {
  toFeieMarkup,
  FEIE_DOTS_PER_MM,
  FEIE_CONTENT_LIMIT,
} from "./feie-markup";
import type { LabelLayout } from "@/lib/label-layout";

const layout = buildLabelLayout(
  { customer_name: "Ada", order_number: "67" },
  { widthMm: 50, heightMm: 30 },
);

describe("toFeieMarkup", () => {
  it("declares the label size in millimetres", () => {
    expect(toFeieMarkup(layout)).toContain("<SIZE>50,30</SIZE>");
  });

  it("writes text positions in dots", () => {
    const markup = toFeieMarkup({
      widthMm: 50,
      heightMm: 30,
      elements: [
        {
          kind: "text",
          text: "Ada",
          xMm: 10,
          yMm: 5,
          size: "md",
          bold: false,
          align: "left",
        },
      ],
    });

    expect(markup).toContain(`x="${10 * FEIE_DOTS_PER_MM}"`);
    expect(markup).toContain(`y="${5 * FEIE_DOTS_PER_MM}"`);
  });

  it("magnifies the order number more than the name", () => {
    const markup = toFeieMarkup(layout);
    const order = markup.match(/<TEXT[^>]*>#67<\/TEXT>/)?.[0] ?? "";
    const name = markup.match(/<TEXT[^>]*>Ada<\/TEXT>/)?.[0] ?? "";

    expect(order).toContain('w="4"');
    expect(name).toContain('w="2"');
  });

  it("renders a QR element as a QR tag", () => {
    const withQr: LabelLayout = {
      widthMm: 50,
      heightMm: 30,
      elements: [
        {
          kind: "qr",
          value: "https://merqo.io/o/abc",
          xMm: 5,
          yMm: 5,
          sizeMm: 10,
        },
      ],
    };

    expect(toFeieMarkup(withQr)).toContain(
      '<QR x="40" y="40" e="L" w="5">https://merqo.io/o/abc</QR>',
    );
  });

  it("escapes characters that would break the markup", () => {
    const markup = toFeieMarkup({
      widthMm: 50,
      heightMm: 30,
      elements: [
        {
          kind: "text",
          text: 'A<b>&"x"',
          xMm: 1,
          yMm: 1,
          size: "sm",
          bold: false,
          align: "left",
        },
      ],
    });

    expect(markup).toContain("A&lt;b&gt;&amp;&quot;x&quot;");
    expect(markup).not.toContain("<b>");
  });

  it("keeps a Chinese name intact", () => {
    const markup = toFeieMarkup(
      buildLabelLayout(
        { customer_name: "陈明", order_number: "7" },
        { widthMm: 50, heightMm: 30 },
      ),
    );
    expect(markup).toContain("陈明");
  });

  it("drops whole elements rather than exceeding the content limit", () => {
    const many: LabelLayout = {
      widthMm: 50,
      heightMm: 30,
      elements: Array.from({ length: 400 }, (_, index) => ({
        kind: "text" as const,
        text: `line ${index} ${"x".repeat(40)}`,
        xMm: 1,
        yMm: index,
        size: "sm" as const,
        bold: false,
        align: "left" as const,
      })),
    };

    const markup = toFeieMarkup(many);

    expect(Buffer.byteLength(markup, "utf8")).toBeLessThanOrEqual(
      FEIE_CONTENT_LIMIT,
    );
    expect(markup.endsWith("</TEXT>")).toBe(true);
  });
});
