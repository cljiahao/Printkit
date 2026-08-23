"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Read-only: subscribes to the presence channel Plan 4's bridge device
 * publishes to (channel name/key contract declared in Plan 3's Global
 * Constraints) — never calls .track() itself.
 */
export function BridgeStatus({
  vendorId,
  locationId,
  label,
}: {
  vendorId: string;
  locationId: string;
  label: string;
}) {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(
      `printkit:presence:${vendorId}:${locationId}`,
    );

    const syncState = () => {
      const state = channel.presenceState() as Record<string, unknown[]>;
      setOnline(Boolean(state.bridge?.length));
    };

    channel.on("presence", { event: "sync" }, syncState).subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [vendorId, locationId]);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full",
          online ? "bg-mint" : "bg-muted-foreground/40",
        )}
        aria-hidden
      />
      <span
        className={online ? "text-mint font-medium" : "text-muted-foreground"}
      >
        {label} Bridge {online ? "online" : "offline"}
      </span>
    </div>
  );
}
