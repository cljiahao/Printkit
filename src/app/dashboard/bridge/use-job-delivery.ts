"use client";

import { useEffect } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/types";

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
  locationId: string,
  onJobQueued: (jobId: string, payload: Json, jobType: string) => void,
): void {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(
      `printkit:job-delivery:${vendorId}:${locationId}`,
    );

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "printkit",
          table: "print_jobs",
          filter: `location_id=eq.${locationId}`,
        },
        (
          payload: RealtimePostgresChangesPayload<{
            id: string;
            status: string;
            payload: Json;
            job_type: string;
          }>,
        ) => {
          if (
            "id" in payload.new &&
            "status" in payload.new &&
            "payload" in payload.new &&
            payload.new.status === "queued"
          ) {
            // job_type defaults to 'label' defensively — the DB column
            // itself defaults to 'label' too, so this only matters for a
            // row shape postgres_changes hasn't actually sent in practice.
            const jobType =
              "job_type" in payload.new && payload.new.job_type
                ? payload.new.job_type
                : "label";
            onJobQueued(payload.new.id, payload.new.payload, jobType);
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
  }, [vendorId, locationId, onJobQueued]);
}
