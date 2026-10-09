"use client";

import { useState } from "react";
import { useAsyncAction } from "@/hooks/use-async-action";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CatalogEntry } from "@/lib/printer-catalog";
import { createPrinterUrl } from "./actions";
import { Step, WaitingForPrinter } from "./setup-step";

export function CloudPollSetup({
  entry,
  locationId,
}: {
  entry: CatalogEntry;
  locationId: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const { pending: busy, run } = useAsyncAction();

  const onCreate = async () => {
    return run(async () => {
      try {
        const result = await createPrinterUrl(locationId, entry.id);

        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setUrl(result.url);
      } catch {
        toast.error("Could not complete setup. Please try again.");
      }
    });
  };

  return (
    <ol className="space-y-5">
      <Step number={1} title="Get this booth's printer address">
        {url ? (
          <div className="space-y-2">
            <code className="bg-muted block rounded-md px-3 py-2 font-mono text-xs break-all">
              {url}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard
                  .writeText(url)
                  .then(() => toast.success("Address copied"))
                  .catch(() => toast.error("Could not copy the address"));
              }}
            >
              Copy address
            </Button>
            <p className="text-muted-foreground text-xs">
              Keep this private. Anyone with it can print to this booth. Make a
              new one here if it leaks.
            </p>
          </div>
        ) : (
          <Button onClick={onCreate} disabled={busy}>
            {busy ? "Working..." : "Create the address"}
          </Button>
        )}
      </Step>

      <Step
        number={2}
        title={`Open the ${entry.brand} printer's own settings page`}
      >
        <p className="text-muted-foreground text-sm">
          Put the printer on the same WiFi as your iPad, then open its settings
          page in a browser. The printer&apos;s manual shows how to find its
          address.
        </p>
      </Step>

      <Step number={3} title="Paste the address into CloudPRNT settings">
        <p className="text-muted-foreground text-sm">
          Turn CloudPRNT on, paste the address into the server URL box, and set
          the poll interval to 5 seconds. Save and restart the printer.
        </p>
      </Step>

      <Step number={4} title="Wait for it to connect">
        <WaitingForPrinter locationId={locationId} />
      </Step>
    </ol>
  );
}
