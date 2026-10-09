"use client";

import { useEffect, useState } from "react";
import { readPrinterState } from "./actions";

const POLL_MS = 4000;

export function Step({
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
export function WaitingForPrinter({ locationId }: { locationId: string }) {
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
