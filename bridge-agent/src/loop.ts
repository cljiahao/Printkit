import { UnauthorizedError, type PrintkitClient } from "./client.js";

export type LabelPrinter = {
  print(png: Uint8Array): Promise<void>;
  reconnect(): Promise<void>;
};

export type LoopDeps = {
  client: PrintkitClient;
  printer: LabelPrinter;
  log: (message: string) => void;
  sleep: (ms: number) => Promise<void>;
};

export const POLL_INTERVAL_MS = 3000;
const MAX_BACKOFF_MS = 60_000;

/**
 * One poll: claim at most one job, print it, and say what happened. A print
 * failure is reported rather than retried, because printkit owns the retry
 * decision (a vendor reprints from the dashboard) and a silent retry loop
 * would burn labels.
 */
export async function runOnce(
  deps: LoopDeps,
): Promise<"idle" | "printed" | "failed"> {
  const job = await deps.client.nextJob();
  if (!job) return "idle";

  deps.log(`Printing job ${job.jobId}`);
  try {
    const png = await deps.client.fetchLabel(job.jobId);
    await deps.printer.print(png);
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    deps.log(`Print failed: ${String(err)}`);
    await deps.client.reportResult(job.jobId, "failed");
    await deps.printer.reconnect();
    return "failed";
  }

  await deps.client.reportResult(job.jobId, "printed");
  return "printed";
}

/**
 * The service loop. It backs off when printkit is unreachable, and stops
 * entirely once the agent has been unpaired, so a revoked printer's agent
 * does not keep knocking forever.
 */
export async function runLoop(
  deps: LoopDeps,
  shouldContinue: () => boolean = () => true,
): Promise<void> {
  let backoff = POLL_INTERVAL_MS;

  while (shouldContinue()) {
    try {
      await runOnce(deps);
      backoff = POLL_INTERVAL_MS;
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        deps.log("Unpaired by printkit. Stopping.");
        return;
      }
      deps.log(`Could not reach printkit: ${String(err)}`);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }

    await deps.sleep(backoff);
  }
}
