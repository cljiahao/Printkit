import { buildLabelLayout } from "@/lib/label-layout";
import { rasterizeLayout } from "@/lib/label-raster";
import { getCatalogEntry } from "@/lib/printer-catalog";
import type { PrinterRow } from "@/lib/printers";
import type { Json } from "@/lib/types";

/**
 * One label, rendered for one printer: built at that printer's configured
 * label size and rasterized at its model's dpi. Every device that prints a
 * raster image goes through here, so a Star printer, a NIIMBOT over
 * Bluetooth and the virtual printer all produce the same label.
 */
export async function renderJobForPrinter(
  payload: Json,
  printer: Pick<
    PrinterRow,
    "label_width_mm" | "label_height_mm" | "catalog_id"
  >,
): Promise<Buffer> {
  const layout = buildLabelLayout(payload, {
    widthMm: Number(printer.label_width_mm),
    heightMm: Number(printer.label_height_mm),
  });
  const dpi = getCatalogEntry(printer.catalog_id)?.dpi ?? 203;
  return rasterizeLayout(layout, dpi);
}
