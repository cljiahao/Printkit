import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAgent } from "@/lib/agent-auth";
import { updatePrintJobStatus } from "@/lib/print-jobs";
import { createServiceClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({ result: z.enum(["printed", "failed"]) });

/**
 * What the agent saw. Scoped to the agent's own booth, so an agent cannot
 * report an outcome for another printer's job and, through the kit
 * callback, tell a different vendor their label printed.
 */
export async function POST(request: Request, context: RouteContext) {
  const printer = await resolveAgent(request);
  if (!printer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id } = await context.params;
  const supabase = await createServiceClient();
  const { data: job } = await supabase
    .from("print_jobs")
    .select("id")
    .eq("id", id)
    .eq("location_id", printer.location_id)
    // Only a job this agent claimed and has not settled yet: a late report
    // must not overwrite a job the vendor has since requeued or reprinted.
    .eq("status", "sent")
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  }

  await updatePrintJobStatus(
    id,
    parsed.data.result,
    parsed.data.result === "failed" ? "device_reported_error" : undefined,
  );

  return NextResponse.json({ ok: true });
}
