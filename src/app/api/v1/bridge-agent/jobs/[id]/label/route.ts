import { NextResponse } from "next/server";
import { resolveAgent } from "@/lib/agent-auth";
import { renderJobForPrinter } from "@/lib/render-job";
import { createServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The label bytes for a job this agent has already claimed. Scoped to the
 * agent's own booth, so a token cannot be used to read another printer's
 * labels, which would leak customer names.
 */
export async function GET(request: Request, context: RouteContext) {
  const printer = await resolveAgent(request);
  if (!printer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const supabase = await createServiceClient();
  const { data: job, error } = await supabase
    .from("print_jobs")
    .select("id, payload, status")
    .eq("id", id)
    .eq("location_id", printer.location_id)
    .maybeSingle();

  if (error) {
    console.error("bridge-agent label: job read failed", error.message);
    return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  }
  if (!job || job.status !== "sent") {
    return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  }

  const png = await renderJobForPrinter(job.payload as Json, printer);
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}
