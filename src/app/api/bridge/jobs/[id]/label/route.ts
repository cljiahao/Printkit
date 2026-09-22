import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getPrinterByLocation } from "@/lib/printers";
import { renderJobForPrinter } from "@/lib/render-job";
import type { Json } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

const notFound = () =>
  NextResponse.json({ error: "Unknown job" }, { status: 404 });

/**
 * The label a bridge device prints. The bridge draws nothing itself, so
 * every connector prints the identical label. The read uses the vendor's
 * own session client, which means print_jobs' RLS policy decides whose job
 * this is rather than a filter written here.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: job, error } = await supabase
    .from("print_jobs")
    .select("id, payload, location_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("bridge label: job read failed", error.message);
    return notFound();
  }
  if (!job?.location_id) return notFound();

  const printer = await getPrinterByLocation(job.location_id);
  if (!printer) return notFound();

  const png = await renderJobForPrinter(job.payload as Json, printer);

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}
