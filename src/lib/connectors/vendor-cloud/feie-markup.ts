import type { LabelElement, LabelLayout } from "@/lib/label-layout";

export const FEIE_DOTS_PER_MM = 8;
export const FEIE_CONTENT_LIMIT = 5000;

const MAGNIFICATION: Record<"sm" | "md" | "lg" | "xl", number> = {
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
};

/**
 * Feie's built-in font 12, its Simplified Chinese 24x24 font, which also
 * covers Latin text. The printer renders text itself, which is why this
 * driver sends markup rather than the PNG the raster drivers use: its
 * <IMG> tag only accepts a square image of at most 224 px, far too small
 * for a whole label.
 */
const FONT = "12";

/**
 * A Latin character's width in dots at magnification 1 (half of the 24 dot
 * cell a Chinese character fills), used only to approximate centred and
 * right-aligned text: Feie has no alignment attribute, so alignment
 * becomes an x offset.
 */
const CHAR_WIDTH_DOTS = 12;

const WIDE_CHAR = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

/** Text width in half-width cells: a CJK character fills two. */
function cellCount(text: string): number {
  let cells = 0;
  for (const char of text) cells += WIDE_CHAR.test(char) ? 2 : 1;
  return cells;
}

function dots(mm: number): number {
  return Math.round(mm * FEIE_DOTS_PER_MM);
}

function escapeMarkup(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function alignedX(element: Extract<LabelElement, { kind: "text" }>): number {
  const widthDots =
    cellCount(element.text) * CHAR_WIDTH_DOTS * MAGNIFICATION[element.size];
  const x = dots(element.xMm);

  if (element.align === "center") return Math.max(0, x - widthDots / 2);
  if (element.align === "right") return Math.max(0, x - widthDots);
  return x;
}

function renderElement(element: LabelElement): string {
  if (element.kind === "qr") {
    return `<QR x="${dots(element.xMm)}" y="${dots(element.yMm)}" e="L" w="${Math.max(
      1,
      Math.round(element.sizeMm / 2),
    )}">${escapeMarkup(element.value)}</QR>`;
  }

  const magnification = MAGNIFICATION[element.size];
  return `<TEXT x="${Math.round(alignedX(element))}" y="${dots(
    element.yMm,
  )}" font="${FONT}" w="${magnification}" h="${magnification}" r="0">${escapeMarkup(
    element.text,
  )}</TEXT>`;
}

/**
 * Translates a label layout into Feie's tag language. Coordinates are dots
 * (8 per millimetre); the label size stays in millimetres, which is what
 * <SIZE> expects. Elements are dropped whole if the markup would exceed
 * Feie's byte limit, since a truncated tag would print as garbage.
 */
export function toFeieMarkup(layout: LabelLayout): string {
  const header = `<SIZE>${layout.widthMm},${layout.heightMm}</SIZE><GAP>2,0</GAP><DIRECTION>1</DIRECTION>`;

  let markup = header;
  for (const element of layout.elements) {
    const next = markup + renderElement(element);
    if (Buffer.byteLength(next, "utf8") > FEIE_CONTENT_LIMIT) break;
    markup = next;
  }
  return markup;
}
