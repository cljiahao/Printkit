"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { isBridgeModeEnabled, setBridgeModeEnabled } from "@/lib/bridge-mode";
import {
  connectPrinter,
  printLabel,
  disconnectPrinter,
} from "@/lib/niimbot-print";
import { fetchLabelCanvas, fetchSampleLabelCanvas } from "@/lib/label-image";
import { useJobDelivery } from "./use-job-delivery";
import { useWakeLock } from "./use-wake-lock";
import {
  reportPrintResult,
  logBridgeEvent,
  claimBridgeJob,
  bridgeHeartbeat,
  ensureBridgePrinter,
} from "./actions";
import type { NiimbotBluetoothClient } from "@mmote/niimbluelib";

type PairState = "unpaired" | "connecting" | "connected" | "error";

const HEARTBEAT_MS = 20_000;

/**
 * The Bridge-mode state machine: local toggle -> pair (Web Bluetooth user
 * gesture) -> claim a delivered job -> print the label printkit rendered ->
 * report the outcome. The bridge draws nothing itself, and a realtime event
 * is only a hint: the claim is what decides this device may print.
 */
export function BridgePanel({
  vendorId,
  locationId,
}: {
  vendorId: string;
  locationId: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [pairState, setPairState] = useState<PairState>("unpaired");
  const clientRef = useRef<NiimbotBluetoothClient | null>(null);
  // Chains print attempts so two jobs queued close together never run their
  // Bluetooth print sequences concurrently against the same client — a
  // second printLabel() starting mid-sequence can fire printEnd() while the
  // first is still printing.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    // localStorage is unavailable during SSR; reading it post-mount (rather
    // than as useState's initializer) avoids a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(isBridgeModeEnabled());
  }, []);

  useWakeLock(enabled);

  useEffect(() => {
    if (!enabled) return;
    const beat = () => {
      bridgeHeartbeat(locationId).catch((err: unknown) => {
        console.error("Heartbeat failed", err);
      });
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => {
      clearInterval(timer);
    };
  }, [enabled, locationId]);

  const doPrintJob = useCallback(
    async (jobId?: string) => {
      const client = clientRef.current;
      if (!client) return;

      const claim = await claimBridgeJob(locationId, jobId);
      if (!claim.ok) return;

      try {
        const canvas = await fetchLabelCanvas(claim.jobId);
        await printLabel(client, canvas);
        await reportPrintResult(claim.jobId, "printed");
      } catch (err) {
        console.error("Print failed", err);
        toast.error("Print failed. Check the printer and try again.");
        await reportPrintResult(claim.jobId, "failed");
      }
    },
    [locationId],
  );

  const printJob = useCallback(
    (jobId?: string) => {
      // .catch() resets the chain to resolved after each job — doPrintJob
      // already swallows print/report failures internally, but this is a
      // backstop so an unexpected throw can't leave every future job
      // permanently chained onto a rejected promise.
      queueRef.current = queueRef.current
        .then(() => doPrintJob(jobId))
        .catch((err: unknown) => {
          console.error("Unexpected error in print queue", err);
        });
    },
    [doPrintJob],
  );

  useJobDelivery(vendorId, locationId, printJob);

  const handleToggle = (next: boolean) => {
    setEnabled(next);
    setBridgeModeEnabled(next);
    if (!next) {
      const client = clientRef.current;
      if (client) disconnectPrinter(client).catch(() => {});
      clientRef.current = null;
      setPairState("unpaired");
      logBridgeEvent("bridge_disconnected").catch(() => {});
    }
  };

  const handlePair = async () => {
    setPairState("connecting");
    try {
      const client = await connectPrinter();
      clientRef.current = client;
      setPairState("connected");
      logBridgeEvent("printer_paired").catch(() => {});
      await ensureBridgePrinter(locationId);
      // A job queued while this bridge was off is still printable, so long
      // as it has not expired: claim whatever is waiting rather than making
      // the vendor reprint it by hand.
      printJob();
    } catch (err) {
      console.error("Pairing failed", err);
      toast.error("Could not pair with the printer.");
      setPairState("error");
    }
  };

  const handleTestPrint = async () => {
    const client = clientRef.current;
    if (!client) return;
    // Verifies the paired printer works, not any real queued job, so it
    // asks the server for a sample label rather than claiming one.
    try {
      const canvas = await fetchSampleLabelCanvas(locationId);
      await printLabel(client, canvas);
      toast.success("Test label sent.");
    } catch (err) {
      console.error("Test print failed", err);
      toast.error("Test print failed.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          aria-label="Bridge mode"
        />
        <span className="text-sm font-medium">Bridge mode</span>
      </div>

      {enabled && pairState === "unpaired" && (
        <Button onClick={handlePair}>Pair printer</Button>
      )}
      {pairState === "connecting" && (
        <p className="text-muted-foreground text-sm">Connecting…</p>
      )}
      {pairState === "connected" && (
        <div className="space-y-3">
          <p className="text-mint text-sm font-medium">Connected</p>
          <Button variant="outline" onClick={handleTestPrint}>
            Print test
          </Button>
        </div>
      )}
      {pairState === "error" && (
        <p className="text-destructive text-sm">Could not pair — try again.</p>
      )}
    </div>
  );
}
