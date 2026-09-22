import { NextResponse } from "next/server";
import { resolveAgent } from "@/lib/agent-auth";
import { claimJob, sweepLocation } from "@/lib/job-dispatch";
import { touchPrinterSeen } from "@/lib/printers";

/**
 * The agent's poll. One request does everything a pull needs: it proves the
 * agent, runs the booth's lazy sweep, records the printer as alive, and
 * claims at most one job. 204 means there is nothing to print, which is the
 * normal answer most of the time.
 */
export async function GET(request: Request) {
  const printer = await resolveAgent(request);
  if (!printer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await sweepLocation(printer.location_id);
  await touchPrinterSeen(printer);

  const job = await claimJob(printer.location_id);
  if (!job) return new Response(null, { status: 204 });

  return NextResponse.json({ job_id: job.id });
}
