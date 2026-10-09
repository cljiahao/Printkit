import { NextResponse } from "next/server";
import { z } from "zod";
import { printAttemptSchema } from "@/lib/print-attempt";
import { resolveAgent } from "@/lib/agent-auth";
import { updatePrintJobStatus } from "@/lib/print-jobs";
import { createServiceClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  result: z.enum(["printed", "failed"]),
  sent_at: printAttemptSchema,
});

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
    .select("id, status, sent_at")
    .eq("id", id)
    .eq("location_id", printer.location_id)
    .eq("sent_at", parsed.data.sent_at)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  }

  if (job.status === parsed.data.result) return NextResponse.json({ ok: true });
  if (job.status !== "sent")
    return NextResponse.json(
      { error: "Print attempt is no longer pending" },
      { status: 409 },
    );

  const result = await updatePrintJobStatus(
    id,
    parsed.data.result,
    parsed.data.result === "failed" ? "device_reported_error" : undefined,
    {
      locationId: printer.location_id,
      expectedStatus: "sent",
      sentAt: parsed.data.sent_at,
    },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
