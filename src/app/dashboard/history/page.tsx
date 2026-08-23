import { getVendorSession } from "@/lib/vendor-session";
import { listPrintJobs } from "@/lib/print-jobs-list";
import { listActiveLocations } from "@/lib/print-locations";
import { JobHistoryTable } from "./job-history-table";

export default async function HistoryPage() {
  const { supabase, user } = await getVendorSession();
  const [jobs, locations] = await Promise.all([
    listPrintJobs(supabase, user.id),
    listActiveLocations(user.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        Print job history
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Every label job printkit has queued for you, most recent first.
      </p>
      <div className="mt-6">
        <JobHistoryTable jobs={jobs} locations={locations} />
      </div>
    </div>
  );
}
