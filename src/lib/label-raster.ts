import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import type { LabelLayout } from "@/lib/label-layout";

const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");
const FONT_FAMILY = "PrintkitLabel";
const FONT_FAMILY_BOLD = "PrintkitLabelBold";
const FONT_FAMILY_CJK = "PrintkitLabelCJK";

let fontsRegistered = false;

/**
 * Vercel's runtime has no usable system fonts, so the label fonts are
 * bundled and registered explicitly. The CJK face is listed after the Latin
 * one in every font string, so a Chinese name still prints.
 */
function registerFonts(): void {
  if (fontsRegistered) return;
  GlobalFonts.registerFromPath(
    path.join(FONT_DIR, "NotoSans-Regular.ttf"),
    FONT_FAMILY,
  );
  GlobalFonts.registerFromPath(
    path.join(FONT_DIR, "NotoSans-Bold.ttf"),
    FONT_FAMILY_BOLD,
  );
  GlobalFonts.registerFromPath(
    path.join(FONT_DIR, "NotoSansSC-Regular.otf"),
    FONT_FAMILY_CJK,
  );
  fontsRegistered = true;
}

const SIZE_SCALE: Record<"sm" | "md" | "lg" | "xl", number> = {
  sm: 0.08,
  md: 0.12,
  lg: 0.18,
  xl: 0.3,
};

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

/**
 * Draws a layout to a monochrome PNG. Every pixel ends pure black or pure
 * white, since a thermal head has no grey: leaving anti-aliased edges in
 * makes small text look muddy once the driver thresholds it itself.
 */
export async function rasterizeLayout(
  layout: LabelLayout,
  dpi: number,
): Promise<Buffer> {
  registerFonts();

  const width = mmToPx(layout.widthMm, dpi);
  const height = mmToPx(layout.heightMm, dpi);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "black";
  ctx.textBaseline = "middle";

  for (const element of layout.elements) {
    if (element.kind !== "text") continue;
    const fontPx = Math.round(height * SIZE_SCALE[element.size]);
    const family = element.bold ? FONT_FAMILY_BOLD : FONT_FAMILY;
    ctx.font = `${fontPx}px "${family}", "${FONT_FAMILY_CJK}"`;
    ctx.textAlign = element.align;
    ctx.fillText(
      element.text,
      mmToPx(element.xMm, dpi),
      mmToPx(element.yMm, dpi),
    );
  }

  const image = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < image.data.length; i += 4) {
    const luminance =
      0.299 * image.data[i] +
      0.587 * image.data[i + 1] +
      0.114 * image.data[i + 2];
    const value = luminance < 128 ? 0 : 255;
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  return canvas.toBuffer("image/png");
}
