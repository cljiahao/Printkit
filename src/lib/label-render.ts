/**
 * NIIMBOT B1's real printhead width in pixels (203 DPI) — confirmed via
 * niimbluelib's own printer_models.ts, not a guess. See Plan 4's Global
 * Constraints.
 */
export const LABEL_WIDTH_PX = 384;
/** A fixed square-ish label height — real physical label size is a
 * per-vendor consumable choice; this is a reasonable v0.1 default, not
 * derived from any printer spec. */
export const LABEL_HEIGHT_PX = 240;

const MAX_CHARS_PER_LINE = 22;

export type LabelLine = { text: string; x: number; y: number; fontPx: number };

function truncate(text: string): string {
  return text.length > MAX_CHARS_PER_LINE
    ? `${text.slice(0, MAX_CHARS_PER_LINE - 1)}…`
    : text;
}

/**
 * Pure layout logic — no canvas/DOM. Two centered lines: customer name
 * (large), order number prefixed with "#" (smaller). Kept separate from
 * the actual canvas paint (renderLabelCanvas below) so this is unit-
 * testable without a canvas 2D context, which jsdom doesn't implement.
 */
export function computeLabelLayout(
  input: { customerName: string; orderNumber: string },
  widthPx: number,
): LabelLine[] {
  const name = truncate(input.customerName.trim() || "Customer");
  const order = `#${input.orderNumber.trim() || "?"}`;

  return [
    { text: name, x: widthPx / 2, y: LABEL_HEIGHT_PX * 0.4, fontPx: 36 },
    { text: order, x: widthPx / 2, y: LABEL_HEIGHT_PX * 0.7, fontPx: 24 },
  ];
}

/**
 * Paints computeLabelLayout's output onto a real canvas — thin DOM
 * plumbing, not separately unit-tested (see this task's Interfaces note).
 * Verified by the manual hardware gate, not this test suite.
 */
export function renderLabelCanvas(input: {
  customerName: string;
  orderNumber: string;
}): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_WIDTH_PX;
  canvas.height = LABEL_HEIGHT_PX;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "black";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const line of computeLabelLayout(input, LABEL_WIDTH_PX)) {
    ctx.font = `bold ${line.fontPx}px sans-serif`;
    ctx.fillText(line.text, line.x, line.y);
  }

  return canvas;
}
