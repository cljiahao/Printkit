import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PrintJobStatus } from "@/lib/print-jobs";

const STATUS_META: Record<
  PrintJobStatus,
  { label: string; className: string }
> = {
  queued: { label: "Queued", className: "bg-secondary text-muted-foreground" },
  sent: {
    label: "Sent",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  printed: { label: "Printed", className: "bg-mint/15 text-mint" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive" },
};

export function JobStatusBadge({ status }: { status: PrintJobStatus }) {
  const { label, className } = STATUS_META[status];
  return <Badge className={cn("font-medium", className)}>{label}</Badge>;
}
