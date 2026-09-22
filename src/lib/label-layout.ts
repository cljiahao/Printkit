import { payloadField } from "@/lib/print-job-payload";
import type { Json } from "@/lib/types";

export const MAX_LABEL_CHARS = 22;

export type LabelElement =
  | {
      kind: "text";
      text: string;
      xMm: number;
      yMm: number;
      size: "sm" | "md" | "lg" | "xl";
      bold: boolean;
      align: "left" | "center" | "right";
    }
  | { kind: "qr"; value: string; xMm: number; yMm: number; sizeMm: number };

export type LabelLayout = {
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
};

function truncate(text: string): string {
  return text.length > MAX_LABEL_CHARS
    ? `${text.slice(0, MAX_LABEL_CHARS - 1)}…`
    : text;
}

/**
 * Device-independent label content. Every connector renders this same
 * layout: raster drivers through rasterizeLayout, markup drivers by
 * translating it into their own tags. Positions are in millimetres from the
 * label's top-left, so one layout suits printers of different dpi.
 */
export function buildLabelLayout(
  payload: Json,
  size: { widthMm: number; heightMm: number },
): LabelLayout {
  const rawName = payloadField(payload, "customer_name", "").trim();
  const name = truncate(rawName || "Customer");
  const orderNumber = payloadField(payload, "order_number", "").trim() || "?";

  return {
    widthMm: size.widthMm,
    heightMm: size.heightMm,
    elements: [
      {
        kind: "text",
        text: `#${orderNumber}`,
        xMm: size.widthMm / 2,
        yMm: size.heightMm * 0.42,
        size: "xl",
        bold: true,
        align: "center",
      },
      {
        kind: "text",
        text: name,
        xMm: size.widthMm / 2,
        yMm: size.heightMm * 0.75,
        size: "md",
        bold: false,
        align: "center",
      },
    ],
  };
}
