"use client";

import { useEffect } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Job delivery: reuses Postgres's own replication feed (postgres_changes)
 * instead of a custom broadcast channel — a row arriving/transitioning to
 * status='queued' (a fresh qkit job, or a reprint's reset) is what the
 * bridge treats as "print this." The `filter` here is a query convenience;
 * print_jobs' own RLS is the real authorization boundary (see Plan 4's
 * Global Constraints). Re-subscribes on visibilitychange if the channel
 * isn't currently joined — Supabase Realtime silently drops a backgrounded
 * tab's connection after ~5 min (spec's documented Reliability mitigation).
 */
export function useJobDelivery(
  vendorId: string,
  onJobQueued: (jobId: string) => void,
): void {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`printkit:job-delivery:${vendorId}`);

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "printkit",
          table: "print_jobs",
          filter: `vendor_id=eq.${vendorId}`,
        },
        (
          payload: RealtimePostgresChangesPayload<{
            id: string;
            status: string;
          }>,
        ) => {
          if (
            "id" in payload.new &&
            "status" in payload.new &&
            payload.new.status === "queued"
          ) {
            onJobQueued(payload.new.id);
          }
        },
      )
      .subscribe();

    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        channel.state !== "joined"
      ) {
        channel.subscribe();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      channel.unsubscribe();
    };
  }, [vendorId, onJobQueued]);
}
