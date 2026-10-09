"use client";

import { useState } from "react";
import { useAsyncAction } from "@/hooks/use-async-action";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CatalogEntry } from "@/lib/printer-catalog";
import { registerBrandCloudPrinter } from "./actions";
import { Step, WaitingForPrinter } from "./setup-step";

export function VendorCloudSetup({
  entry,
  locationId,
}: {
  entry: CatalogEntry;
  locationId: string;
}) {
  const [sn, setSn] = useState("");
  const [key, setKey] = useState("");
  const { pending: busy, run } = useAsyncAction();
  const [registered, setRegistered] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    return run(async () => {
      try {
        const result = await registerBrandCloudPrinter(
          locationId,
          entry.id,
          sn.trim(),
          key.trim(),
        );

        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setRegistered(true);
        setKey("");
        toast.success(
          result.state === "online"
            ? "Printer added and online"
            : "Printer added. It will show as online once it is switched on.",
        );
      } catch {
        toast.error("Could not complete setup. Please try again.");
      }
    });
  };

  return (
    <ol className="space-y-5">
      <Step number={1} title="Put the printer where it will be used">
        <p className="text-muted-foreground text-sm">
          {entry.connectivity.includes("4g")
            ? "Insert a data SIM and switch the printer on. It does not need WiFi."
            : "Join the printer to WiFi and switch it on."}
        </p>
      </Step>

      <Step number={2} title="Type the SN and KEY printed on the printer">
        <form onSubmit={onSubmit} className="max-w-sm space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sn">SN</Label>
            <Input
              id="sn"
              value={sn}
              onChange={(event) => setSn(event.target.value)}
              placeholder="On the sticker underneath"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="key">KEY</Label>
            <Input
              id="key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="Next to the SN"
              autoComplete="off"
            />
          </div>
          <p className="text-muted-foreground text-xs">
            We use the KEY once to claim the printer and never store it.
          </p>
          <Button type="submit" disabled={busy || !sn || !key}>
            {busy ? "Adding..." : "Add this printer"}
          </Button>
        </form>
      </Step>

      <Step number={3} title="Check it is connected">
        {registered ? (
          <WaitingForPrinter locationId={locationId} />
        ) : (
          <p className="text-muted-foreground text-sm">
            Add the printer above first.
          </p>
        )}
      </Step>
    </ol>
  );
}
