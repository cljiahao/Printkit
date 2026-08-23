import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Order #</TableHead>
          <TableHead>Booth</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <TableRow key={job.id}>
            <TableCell>{payloadField(job.payload, "customer_name")}</TableCell>
            <TableCell>{payloadField(job.payload, "order_number")}</TableCell>
            <TableCell>
              {job.location_id === null ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">
                    Unrouted
                  </span>
                  <AssignLocationControl jobId={job.id} locations={locations} />
                </div>
              ) : (
                (job.print_locations?.label ?? "Unrouted")
              )}
            </TableCell>
            <TableCell>
              <JobStatusBadge status={job.status} />
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {formatDateTime(job.created_at)}
            </TableCell>
            <TableCell>
              {job.status === "failed" ? (
                <ReprintButton jobId={job.id} />
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
