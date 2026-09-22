"use client";

import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { INFO_COPY, type InfoTopic } from "@/lib/printer-info-copy";

/**
 * Opens on tap, not on hover: vendors read this on an iPad, where a hover
 * tooltip never appears. The trigger is a real button so it is reachable by
 * keyboard and announced by a screen reader.
 */
export function InfoButton({ topic }: { topic: InfoTopic }) {
  const copy = INFO_COPY[topic];

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`What does "${copy.title}" mean?`}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Info aria-hidden className="size-4" />
      </PopoverTrigger>
      <PopoverContent>
        <p className="font-medium">{copy.title}</p>
        <p className="text-muted-foreground mt-1">{copy.body}</p>
      </PopoverContent>
    </Popover>
  );
}
