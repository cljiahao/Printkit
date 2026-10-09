import Link from "next/link";
import { getVendorSession } from "@/lib/vendor-session";
import { listPrintHistoryPage } from "@/lib/print-history";
import { listActiveLocations } from "@/lib/print-locations";
import { JobHistoryTable } from "./job-history-table";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ unrouted?: string; cursor?: string }>;
}) {
  const [{ supabase, user }, params] = await Promise.all([
    getVendorSession(),
    searchParams,
  ]);
  const unrouted = params.unrouted === "1";
  const [{ jobs, nextCursor }, locations] = await Promise.all([
    listPrintHistoryPage(supabase, user.id, {
      unrouted,
      cursor: params.cursor,
    }),
    listActiveLocations(user.id),
  ]);
  const next = new URLSearchParams();
  if (unrouted) next.set("unrouted", "1");
  if (nextCursor) next.set("cursor", nextCursor);
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        Print job history
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Your label jobs, most recent first. Browse older jobs below.
      </p>
      <div className="mt-6">
        <JobHistoryTable jobs={jobs} locations={locations} />
      </div>
      <nav aria-label="Print history pages" className="mt-6 flex gap-4 text-sm">
        {params.cursor && (
          <Link
            href={
              unrouted ? "/dashboard/history?unrouted=1" : "/dashboard/history"
            }
          >
            Newest jobs
          </Link>
        )}
        {nextCursor && (
          <Link href={"/dashboard/history?" + next.toString()}>Older jobs</Link>
        )}
      </nav>
    </div>
  );
}
