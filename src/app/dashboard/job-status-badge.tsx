import { StatusBadge } from "@merqo/ui";
import type { PrintJobStatus } from "@/lib/print-jobs";

const STATUS_CONFIG: Record<
  PrintJobStatus,
  { label: string; className: string }
> = {
  queued: {
    label: "Queued",
    className: "text-secondary border-secondary/35 bg-secondary/12",
  },
  sent: {
    label: "Sent",
    className: "text-flow border-flow/35 bg-flow/12",
  },
  printed: {
    label: "Printed",
    className: "text-mint border-mint/35 bg-mint/12",
  },
  failed: {
    label: "Failed",
    className: "text-destructive border-destructive/35 bg-destructive/12",
  },
};

export function JobStatusBadge({ status }: { status: PrintJobStatus }) {
  return <StatusBadge status={status} config={STATUS_CONFIG} />;
}
