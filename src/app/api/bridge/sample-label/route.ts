import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getPrinterByLocation } from "@/lib/printers";
import { buildLabelLayout } from "@/lib/label-layout";
import { rasterizeLayout } from "@/lib/label-raster";
import { getCatalogEntry } from "@/lib/printer-catalog";

const querySchema = z.object({ location: z.string().uuid() });

/**
 * A sample label at a booth's own label size, for the test print during
 * setup. It renders through the same builder a real order uses, so what a
 * vendor checks is what an order will produce.
 */
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    location: url.searchParams.get("location") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Unknown booth" }, { status: 400 });
  }

  const { data: location } = await supabase
    .from("print_locations")
    .select("id")
    .eq("id", parsed.data.location)
    .maybeSingle();
  if (!location) {
    return NextResponse.json({ error: "Unknown booth" }, { status: 404 });
  }

  const printer = await getPrinterByLocation(location.id);
  const layout = buildLabelLayout(
    { customer_name: "Test", order_number: "0000" },
    {
      widthMm: Number(printer?.label_width_mm ?? 50),
      heightMm: Number(printer?.label_height_mm ?? 30),
    },
  );
  const dpi = printer ? (getCatalogEntry(printer.catalog_id)?.dpi ?? 203) : 203;
  const png = await rasterizeLayout(layout, dpi);

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}
