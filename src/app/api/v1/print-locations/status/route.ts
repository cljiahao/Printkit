import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyKitAuth } from "@/lib/kit-auth";
import { resolveActiveLocation } from "@/lib/print-locations";
import { getPrinterByLocation, printerState } from "@/lib/printers";
import { sweepLocation } from "@/lib/job-dispatch";
import { getCatalogEntry } from "@/lib/printer-catalog";

const querySchema = z.object({ source_ref: z.string().min(1) });

/**
 * A calling kit asks whether one of its locations has a printer and whether
 * that printer is reachable, so it can show the vendor a live status
 * without subscribing to printkit's own realtime channels.
 */
export async function GET(request: Request) {
  const auth = await verifyKitAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    source_ref: url.searchParams.get("source_ref") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "source_ref is required" },
      { status: 400 },
    );
  }

  const location = await resolveActiveLocation(
    auth.kitSlug,
    parsed.data.source_ref,
  );
  if (!location) {
    return NextResponse.json({ printer: null });
  }

  await sweepLocation(location.id);

  const printer = await getPrinterByLocation(location.id);
  if (!printer) {
    return NextResponse.json({ printer: null });
  }

  return NextResponse.json({
    printer: {
      display_name: printer.display_name,
      catalog_id: printer.catalog_id,
      connector: printer.connector,
      state: printerState(printer.last_seen_at),
      last_seen_at: printer.last_seen_at,
      hardware_verified:
        getCatalogEntry(printer.catalog_id)?.hardwareVerified ?? false,
    },
  });
}
