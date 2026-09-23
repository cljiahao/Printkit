"use client";

import { useEffect } from "react";

/**
 * Keeps the bridge device's screen awake while Bridge mode is on. A sleeping
 * screen takes Bluetooth and the realtime connection down with it, which is
 * the spec's documented failure mode for this transport. The lock is
 * re-acquired on `visibilitychange` because a wake lock auto-releases when
 * the tab hides and never comes back on its own. It does not override
 * Battery Saver, so the setup guide tells vendors to turn that off.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let wakeLock: { release: () => Promise<void> } | undefined;

    const acquire = async () => {
      // A hidden tab cannot hold a wake lock, and asking anyway throws.
      // Bridge mode can be switched on in a background tab, so skip and
      // wait for the visibilitychange below.
      if (document.visibilityState !== "visible") return;
      try {
        wakeLock = await navigator.wakeLock?.request("screen");
      } catch (err) {
        console.error("Wake Lock request failed", err);
      }
    };
    acquire().catch(() => {});

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") acquire().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      wakeLock?.release().catch(() => {});
    };
  }, [enabled]);
}
