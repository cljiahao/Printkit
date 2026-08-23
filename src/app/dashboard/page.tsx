import Link from "next/link";
import { getVendorSession } from "@/lib/vendor-session";
import { listPrintJobs } from "@/lib/print-jobs-list";
import { BridgeStatus } from "@/components/bridge-status";
import { JobHistoryTable } from "./history/job-history-table";

export default async function DashboardPage() {
  const { supabase, user } = await getVendorSession();
  const recentJobs = await listPrintJobs(supabase, user.id, 5);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your printer bridge and recent print jobs.
        </p>
      </div>

      <div className="rounded-lg border p-4">
        {/* Placeholder locationId/label; Task 7 wires in the real selected location. */}
        <BridgeStatus vendorId={user.id} locationId="" label="" />
      </div>

      <div className="rounded-lg border p-4">
        <p className="text-sm font-medium">Connected to qkit</p>
        <p className="text-muted-foreground mt-1 text-sm">
          New orders from qkit print automatically once your bridge is online.
        </p>
      </div>

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
          <JobHistoryTable jobs={recentJobs} />
        </div>
      </div>
    </div>
  );
}
