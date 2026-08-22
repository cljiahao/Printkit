import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JobStatusBadge } from "../job-status-badge";
import { formatDateTime } from "@/lib/utils";
import type { PrintJob } from "@/lib/print-jobs-list";
import type { Json } from "@/lib/types";

function payloadField(payload: Json, key: string): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    return "—";
  const value = payload[key];
  return typeof value === "string" ? value : "—";
}

export function JobHistoryTable({ jobs }: { jobs: PrintJob[] }) {
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
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <TableRow key={job.id}>
            <TableCell>{payloadField(job.payload, "customer_name")}</TableCell>
            <TableCell>{payloadField(job.payload, "order_number")}</TableCell>
            <TableCell>
              <JobStatusBadge status={job.status} />
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {formatDateTime(job.created_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
