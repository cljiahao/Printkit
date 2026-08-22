"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Publishes to the Presence channel Plan 3's BridgeStatus (subscribe-only)
 * already reads — channel name/key contract declared there. The presence
 * key MUST be set via the channel's own config: an unconfigured channel
 * defaults to `presence: { key: "", enabled: false }`, which makes the
 * server assign a random per-connection key instead of "bridge" — verified
 * against the installed @supabase/realtime-js — so BridgeStatus's
 * `state.bridge` read would silently never match. Also owns the Screen
 * Wake Lock: acquired the moment `enabled` turns true, re-acquired on
 * visibilitychange (a wake lock auto-releases on tab-hide and does not come
 * back on its own) — both are the spec's documented Reliability mitigations
 * for the same underlying failure mode (backgrounding).
 */
export function useBridgePresence(vendorId: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channel = supabase.channel(`printkit:presence:${vendorId}`, {
      config: { presence: { key: "bridge" } },
    });
    channel.subscribe(async (status: string) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ online: true });
      }
    });

    let wakeLock: { release: () => Promise<void> } | undefined;
    const acquireWakeLock = async () => {
      try {
        wakeLock = await navigator.wakeLock?.request("screen");
      } catch (err) {
        console.error("Wake Lock request failed", err);
      }
    };
    acquireWakeLock().catch(() => {});

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible")
        acquireWakeLock().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      wakeLock?.release().catch(() => {});
      channel.untrack().catch(() => {});
      channel.unsubscribe();
    };
  }, [vendorId, enabled]);
}
