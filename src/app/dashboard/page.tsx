import Link from "next/link";
import { getVendorSession } from "@/lib/vendor-session";
import { listPrintJobs, countUnroutedJobs } from "@/lib/print-jobs-list";
import { listActiveLocations } from "@/lib/print-locations";
import { BridgeStatus } from "@/components/bridge-status";
import { JobHistoryTable } from "./history/job-history-table";

export default async function DashboardPage() {
  const { supabase, user } = await getVendorSession();
  const [recentJobs, locations, unroutedCount] = await Promise.all([
    listPrintJobs(supabase, user.id, 5),
    listActiveLocations(user.id),
    countUnroutedJobs(user.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your printer bridge and recent print jobs.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        {locations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No booths have printing enabled yet — turn it on in qkit&apos;s
            booth settings.
          </p>
        ) : (
          locations.map((loc) => (
            <BridgeStatus
              key={loc.id}
              vendorId={user.id}
              locationId={loc.id}
              label={loc.label}
            />
          ))
        )}
      </div>

      <div className="rounded-lg border p-4">
        <p className="text-sm font-medium">Connected to qkit</p>
        <p className="text-muted-foreground mt-1 text-sm">
          New orders from qkit print automatically once your bridge is online.
        </p>
      </div>

      {unroutedCount > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950">
          <Link
            href="/dashboard/history?unrouted=1"
            className="text-amber-900 hover:underline dark:text-amber-200"
          >
            {unroutedCount} unrouted print job
            {unroutedCount === 1 ? "" : "s"} — needs a booth assigned
          </Link>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent jobs</h2>
          <Link
            href="/dashboard/history"
            className="text-primary text-sm hover:underline"
          >
            View all
          </Link>
        </div>
        <div className="mt-3">
          <JobHistoryTable jobs={recentJobs} locations={locations} />
        </div>
      </div>
    </div>
  );
}
