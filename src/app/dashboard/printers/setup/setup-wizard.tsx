"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoButton } from "@/components/info-button";
import { BLUETOOTH_WARNING } from "@/lib/printer-info-copy";
import type { CatalogEntry } from "@/lib/printer-catalog";
import {
  createPrinterUrl,
  registerBrandCloudPrinter,
  createBridgePairingCode,
  readPrinterState,
} from "./actions";

const POLL_MS = 4000;

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="bg-muted text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
        {number}
      </span>
      <div className="space-y-2">
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

/**
 * Waits for the printer to say hello, so a vendor sees the connection land
 * instead of refreshing and guessing.
 */
function WaitingForPrinter({ locationId }: { locationId: string }) {
  const [state, setState] = useState<"online" | "offline" | "not_set_up">(
    "not_set_up",
  );

  useEffect(() => {
    let active = true;
    const check = () => {
      readPrinterState(locationId)
        .then((next) => {
          if (active) setState(next);
        })
        .catch((err: unknown) => {
          console.error("Could not read the printer state", err);
        });
    };
    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [locationId]);

  if (state === "online") {
    return (
      <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
        Connected. Your next order will print here.
      </p>
    );
  }
  return (
    <p className="text-muted-foreground text-sm">
      Waiting for your printer to connect. This page updates by itself.
    </p>
  );
}

export function CloudPollSetup({
  entry,
  locationId,
}: {
  entry: CatalogEntry;
  locationId: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onCreate = async () => {
    setBusy(true);
    const result = await createPrinterUrl(locationId, entry.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setUrl(result.url);
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

export function VendorCloudSetup({
  entry,
  locationId,
}: {
  entry: CatalogEntry;
  locationId: string;
}) {
  const [sn, setSn] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await registerBrandCloudPrinter(
      locationId,
      entry.id,
      sn.trim(),
      key.trim(),
    );
    setBusy(false);

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

export function BridgeSetup({
  locationId,
  boothRef,
}: {
  locationId: string;
  boothRef: string;
}) {
  const [helper, setHelper] = useState<"android" | "pi" | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onPairingCode = async () => {
    setBusy(true);
    const result = await createBridgePairingCode(locationId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setCode(result.code);
  };

  return (
    <div className="space-y-6">
      <div className="border-border rounded-lg border p-4">
        <p className="text-sm font-medium">Before you start</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {BLUETOOTH_WARNING}
        </p>
        <p className="mt-2 text-sm">
          <Link
            href="/guides/bluetooth-printers"
            className="underline underline-offset-4"
          >
            Read the Bluetooth guide
          </Link>
        </p>
      </div>

      <ol className="space-y-5">
        <Step number={1} title="Choose the helper device">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={helper === "android" ? "default" : "outline"}
              size="sm"
              onClick={() => setHelper("android")}
            >
              Android phone
            </Button>
            <Button
              variant={helper === "pi" ? "default" : "outline"}
              size="sm"
              onClick={() => setHelper("pi")}
            >
              Raspberry Pi
            </Button>
            <InfoButton topic="helper_device" />
          </div>
        </Step>

        {helper === "android" && (
          <Step number={2} title="Set the phone up next to the printer">
            <p className="text-muted-foreground text-sm">
              Open printkit on that phone in Chrome, turn Bridge mode on and
              pair the printer. Keep the screen on and Battery Saver off.
            </p>
            <Button asChild size="sm">
              <Link
                href={`/dashboard/bridge?booth=${encodeURIComponent(boothRef)}`}
              >
                Open bridge mode
              </Link>
            </Button>
          </Step>
        )}

        {helper === "pi" && (
          <Step number={2} title="Pair the Raspberry Pi">
            {code ? (
              <div className="space-y-2">
                <p className="font-mono text-2xl font-semibold tracking-widest">
                  {code}
                </p>
                <p className="text-muted-foreground text-sm">
                  Good for 10 minutes, and usable once. On the Pi, run:
                </p>
                <code className="bg-muted block rounded-md px-3 py-2 font-mono text-xs">
                  printkit-bridge pair {code}
                </code>
              </div>
            ) : (
              <Button onClick={onPairingCode} disabled={busy} size="sm">
                {busy ? "Working..." : "Show a pairing code"}
              </Button>
            )}
            <p className="text-muted-foreground text-sm">
              The guide has the install steps for the Pi.
            </p>
          </Step>
        )}

        <Step number={3} title="Check it is connected">
          <WaitingForPrinter locationId={locationId} />
        </Step>
      </ol>
    </div>
  );
}
