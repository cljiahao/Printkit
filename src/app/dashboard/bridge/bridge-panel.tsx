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
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const generationRef = useRef(0);
  const mountedRef = useRef(false);
  const drainingRef = useRef(false);

  const disconnect = useCallback(() => {
    generationRef.current += 1;
    const client = clientRef.current;
    clientRef.current = null;
    if (client) disconnectPrinter(client).catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Read browser storage after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(isBridgeModeEnabled());
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [disconnect]);

  useWakeLock(enabled);

  const enqueue = useCallback(
    (task: (isCurrent: () => boolean) => Promise<void>) => {
      const generation = generationRef.current;
      const isCurrent = () =>
        mountedRef.current && generationRef.current === generation;
      queueRef.current = queueRef.current
        .then(async () => {
          if (isCurrent()) await task(isCurrent);
        })
        .catch((err: unknown) => {
          console.error("Unexpected error in print queue", err);
        });
    },
    [],
  );

  const doPrintJob = useCallback(
    async (isCurrent: () => boolean, jobId?: string) => {
      const client = clientRef.current;
      if (!client || !isCurrent()) return false;
      const claim = await claimBridgeJob(locationId, jobId);
      if (!claim.ok || !isCurrent()) return false;
      let result: "printed" | "failed" = "printed";
      try {
        const canvas = await fetchLabelCanvas(claim.jobId);
        if (!isCurrent()) return false;
        await printLabel(client, canvas);
      } catch (err) {
        console.error("Print failed", err);
        toast.error("Print failed. Check the printer and try again.");
        result = "failed";
      }
      // A failed acknowledgement must not turn a physically printed label into a failure.
      try {
        const outcome = await reportPrintResult(
          claim.jobId,
          result,
          claim.sentAt,
        );
        if (!outcome.success) throw new Error(outcome.error);
      } catch (err) {
        console.error("Print result could not be saved", err);
        toast.error(
          "Print status could not be saved. Check the label before reprinting.",
        );
      }
      return isCurrent();
    },
    [locationId],
  );

  const printJob = useCallback(
    (jobId?: string) => {
      if (!clientRef.current) return;
      if (jobId) {
        enqueue(async (isCurrent) => {
          await doPrintJob(isCurrent, jobId);
        });
        return;
      }
      if (drainingRef.current) return;
      drainingRef.current = true;
      enqueue(async (isCurrent) => {
        for (let count = 0; count < 10 && isCurrent(); count += 1) {
          if (!(await doPrintJob(isCurrent))) break;
        }
      });
      queueRef.current = queueRef.current.finally(() => {
        drainingRef.current = false;
      });
    },
    [doPrintJob, enqueue],
  );

  useEffect(() => {
    if (!enabled) return;
    const beat = () => {
      bridgeHeartbeat(locationId).catch((err: unknown) => {
        console.error("Heartbeat failed", err);
      });
      printJob();
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [enabled, locationId, printJob]);

  useJobDelivery(vendorId, locationId, printJob);

  const handleToggle = (next: boolean) => {
    setEnabled(next);
    setBridgeModeEnabled(next);
    if (!next) {
      disconnect();
      setPairState("unpaired");
      logBridgeEvent("bridge_disconnected").catch(() => {});
    }
  };

  const handlePair = async () => {
    const generation = generationRef.current;
    const isCurrent = () =>
      mountedRef.current && generationRef.current === generation;
    setPairState("connecting");
    try {
      const client = await connectPrinter();
      if (!isCurrent()) {
        await disconnectPrinter(client);
        return;
      }
      clientRef.current = client;
      await ensureBridgePrinter(locationId);
      if (!isCurrent()) return;
      setPairState("connected");
      logBridgeEvent("printer_paired").catch(() => {});
      printJob();
    } catch (err) {
      if (!isCurrent()) return;
      disconnect();
      console.error("Pairing failed", err);
      toast.error("Could not pair with the printer.");
      setPairState("error");
    }
  };

  const handleTestPrint = () =>
    enqueue(async (isCurrent) => {
      const client = clientRef.current;
      if (!client) return;
      try {
        const canvas = await fetchSampleLabelCanvas(locationId);
        if (!isCurrent()) return;
        await printLabel(client, canvas);
        toast.success("Test label sent.");
      } catch (err) {
        console.error("Test print failed", err);
        toast.error("Test print failed.");
      }
    });

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
