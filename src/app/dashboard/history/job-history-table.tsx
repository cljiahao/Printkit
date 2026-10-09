import { DataTable, type DataTableColumn } from "@merqo/ui";
import { JobStatusBadge } from "../job-status-badge";
import { ReprintButton } from "./reprint-button";
import { AssignLocationControl } from "./assign-location-control";
import { formatDateTime } from "@/lib/utils";
import { payloadField } from "@/lib/print-job-payload";
import type { PrintJob } from "@/lib/print-jobs-list";

export function JobHistoryTable({
  jobs,
  locations = [],
}: {
  jobs: PrintJob[];
  locations?: { id: string; label: string }[];
}) {
  if (jobs.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No print jobs yet — they&apos;ll show up here once qkit sends one.
      </p>
    );
  }

  const columns: DataTableColumn<PrintJob>[] = [
    {
      header: "Customer",
      cell: (job) => payloadField(job.payload, "customer_name"),
    },
    {
      header: "Order #",
      cell: (job) => payloadField(job.payload, "order_number"),
    },
    {
      header: "Booth",
      cell: (job) =>
        job.location_id === null ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Unrouted</span>
            {job.status === "queued" && (
              <AssignLocationControl jobId={job.id} locations={locations} />
            )}
          </div>
        ) : (
          (job.print_locations?.label ?? "Unrouted")
        ),
    },
    { header: "Status", cell: (job) => <JobStatusBadge status={job.status} /> },
    {
      header: "Created",
      className: "text-muted-foreground text-sm",
      cell: (job) => formatDateTime(job.created_at),
    },
    {
      header: "Action",
      cell: (job) =>
        job.status === "failed" || job.status === "printed" ? (
          <ReprintButton jobId={job.id} />
        ) : null,
    },
  ];
  return (
    <DataTable rows={jobs} columns={columns} getRowKey={(job) => job.id} />
  );
}
