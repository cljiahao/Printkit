"use client";

import {
  useAsyncAction as useSharedAsyncAction,
  navigatingAway,
} from "@merqo/ui";

/** Runs per-call async handlers with shared pending/error state and cleanup. */
export function useAsyncAction(): {
  pending: boolean;
  error: unknown;
  run: (fn: () => Promise<void>) => Promise<void>;
  reset: () => void;
} {
  return useSharedAsyncAction((fn: () => Promise<void>) => fn());
}

export { navigatingAway };
