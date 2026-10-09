"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { startVirtualPrinter } from "./actions";

const POLL_INTERVAL_MS = 3000;
const MAX_PREVIEWS = 20;

type Printed = { jobId: string; src: string; at: string };

/**
 * A printer made of HTML. It speaks the same CloudPRNT exchange a real Star
 * printer does, against the same endpoint, so the whole path can be proven
 * before any hardware is bought: poll, fetch the PNG, show it, confirm it.
 */
export function VirtualPrinterPanel({
  locations,
}: {
  locations: { id: string; label: string }[];
}) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [token, setToken] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [printed, setPrinted] = useState<Printed[]>([]);
  const busyRef = useRef(false);
  const mountedRef = useRef(false);
  const printedRef = useRef<Printed[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const preview of printedRef.current)
        URL.revokeObjectURL(preview.src);
      printedRef.current = [];
    };
  }, []);

  const pollOnce = useCallback(async (deviceToken: string) => {
    if (busyRef.current || !mountedRef.current) return;
    busyRef.current = true;
    try {
      const url = `/api/cloudprnt/${deviceToken}`;
      const poll = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          printerMAC: "virtual-printer",
          statusCode: "200 OK",
        }),
      });
      if (!poll.ok) return;

      const body: { jobReady?: boolean; jobToken?: string } = await poll.json();
      if (!body.jobReady || !body.jobToken) return;

      const jobId = body.jobToken;
      const job = await fetch(`${url}?token=${encodeURIComponent(jobId)}`);
      if (!job.ok) return;

      const blob = await job.blob();
      if (!mountedRef.current) return;
      const previews = [
        {
          jobId,
          src: URL.createObjectURL(blob),
          at: new Date().toLocaleTimeString(),
        },
        ...printedRef.current,
      ];
      for (const dropped of previews.splice(MAX_PREVIEWS))
        URL.revokeObjectURL(dropped.src);
      printedRef.current = previews;
      setPrinted(previews);

      await fetch(`${url}?token=${encodeURIComponent(jobId)}&code=200`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("virtual printer poll failed", err);
    } finally {
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => {
      pollOnce(token).catch((err: unknown) => {
        console.error("virtual printer poll failed", err);
      });
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [token, pollOnce]);

  const onStart = async () => {
    setStarting(true);
    try {
      const result = await startVirtualPrinter(locationId);
      if (!mountedRef.current) return;
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setToken(result.token);
      toast.success("Virtual printer running");
    } catch {
      if (mountedRef.current)
        toast.error("Could not start the virtual printer. Please try again.");
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      {!token && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Booth</p>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Choose a booth" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onStart} disabled={!locationId || starting}>
            {starting ? "Starting..." : "Start virtual printer"}
          </Button>
        </div>
      )}

      {token && printed.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Waiting for a job. Place an order in qkit for this booth.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {printed.map((label) => (
          <figure key={label.src} className="rounded-lg border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={label.src}
              alt={`Label for job ${label.jobId}`}
              className="w-full bg-white"
            />
            <figcaption className="text-muted-foreground mt-2 text-xs">
              {label.at}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
