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
import { renderLabelCanvas } from "@/lib/label-render";
import { useJobDelivery } from "./use-job-delivery";
import { useBridgePresence } from "./use-bridge-presence";
import { reportPrintResult } from "./actions";
import type { NiimbotBluetoothClient } from "@mmote/niimbluelib";

type PairState = "unpaired" | "connecting" | "connected" | "error";

/**
 * The Bridge-mode state machine: local toggle -> pair (Web Bluetooth user
 * gesture) -> auto-print any job the Realtime feed delivers -> report the
 * outcome. See Plan 4's Global Constraints for the channel/status
 * contracts this composes (useJobDelivery, useBridgePresence,
 * reportPrintResult, updatePrintJobStatus indirectly via the action).
 */
export function BridgePanel({ vendorId }: { vendorId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [pairState, setPairState] = useState<PairState>("unpaired");
  const clientRef = useRef<NiimbotBluetoothClient | null>(null);

  useEffect(() => {
    // localStorage is unavailable during SSR; reading it post-mount (rather
    // than as useState's initializer) avoids a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(isBridgeModeEnabled());
  }, []);

  useBridgePresence(vendorId, enabled);

  const printJob = useCallback(async (jobId: string) => {
    const client = clientRef.current;
    if (!client) return;

    try {
      const canvas = renderLabelCanvas({
        customerName: "",
        orderNumber: jobId,
      });
      await printLabel(client, canvas);
      await reportPrintResult(jobId, "printed");
    } catch (err) {
      console.error("Print failed", err);
      toast.error("Print failed — check the printer and try again.");
      await reportPrintResult(jobId, "failed");
    }
  }, []);

  useJobDelivery(vendorId, printJob);

  const handleToggle = (next: boolean) => {
    setEnabled(next);
    setBridgeModeEnabled(next);
    if (!next) {
      const client = clientRef.current;
      if (client) disconnectPrinter(client).catch(() => {});
      clientRef.current = null;
      setPairState("unpaired");
    }
  };

  const handlePair = async () => {
    setPairState("connecting");
    try {
      const client = await connectPrinter();
      clientRef.current = client;
      setPairState("connected");
    } catch (err) {
      console.error("Pairing failed", err);
      toast.error("Could not pair with the printer.");
      setPairState("error");
    }
  };

  const handleTestPrint = async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const canvas = renderLabelCanvas({
        customerName: "Test",
        orderNumber: "0000",
      });
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
