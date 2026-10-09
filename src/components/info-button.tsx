"use client";

import { InfoTooltip } from "@merqo/ui";
import { INFO_COPY, type InfoTopic } from "@/lib/printer-info-copy";

/** Touch-first printer explanations with a keyboard-accessible trigger. */
export function InfoButton({ topic }: { topic: InfoTopic }) {
  const copy = INFO_COPY[topic];
  return (
    <InfoTooltip
      trigger="tap"
      ariaLabel={`What does "${copy.title}" mean?`}
      triggerClassName="size-6 shrink-0 transition-colors focus-visible:ring-ring"
      iconClassName="size-4"
      contentClassName="rounded-lg text-foreground shadow-lg"
      content={
        <>
          <p className="font-medium">{copy.title}</p>
          <p className="text-muted-foreground mt-1">{copy.body}</p>
        </>
      }
    />
  );
}
