import { cn } from "@/lib/utils";

export type PrinterStatusRowProps = {
  label: string;
  printerName: string | null;
  state: "online" | "offline" | "not_set_up";
  lastSeenAt: string | null;
};

const TONE: Record<PrinterStatusRowProps["state"], string> = {
  online: "bg-emerald-500",
  offline: "bg-muted-foreground",
  not_set_up: "bg-amber-500",
};

function describe(props: PrinterStatusRowProps): string {
  if (props.state === "not_set_up") return "No printer yet";
  if (props.state === "online") return "Printer connected";
  return props.lastSeenAt
    ? `Offline since ${new Date(props.lastSeenAt).toLocaleTimeString()}`
    : "Offline";
}

/**
 * One booth's printer, read from the shared last_seen_at health signal
 * rather than a live channel, so every connector reports the same way and
 * the page needs no client-side subscription.
 */
export function PrinterStatusRow(props: PrinterStatusRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{props.label}</p>
        <p className="text-muted-foreground text-xs">
          {props.printerName ?? "No printer set up"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn("size-2 rounded-full", TONE[props.state])}
        />
        <span className="text-muted-foreground text-xs">{describe(props)}</span>
      </div>
    </div>
  );
}
