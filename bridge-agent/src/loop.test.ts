import { describe, it, expect, vi, beforeEach } from "vitest";
import { runOnce, runLoop, type LoopDeps } from "./loop";
import { UnauthorizedError } from "./client";

const nextJob = vi.fn();
const fetchLabel = vi.fn();
const reportResult = vi.fn();
const print = vi.fn();
const reconnect = vi.fn();
const log = vi.fn();
const sleep = vi.fn().mockResolvedValue(undefined);

function deps(): LoopDeps {
  return {
    client: {
      nextJob,
      fetchLabel,
      reportResult,
    } as unknown as LoopDeps["client"],
    printer: { print, reconnect },
    log,
    sleep,
  };
}

beforeEach(() => {
  nextJob.mockReset().mockResolvedValue(null);
  fetchLabel.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
  reportResult.mockReset().mockResolvedValue(undefined);
  print.mockReset().mockResolvedValue(undefined);
  reconnect.mockReset().mockResolvedValue(undefined);
  log.mockReset();
  sleep.mockClear();
});

describe("runOnce", () => {
  it("does nothing when no job is waiting", async () => {
    expect(await runOnce(deps())).toBe("idle");
    expect(print).not.toHaveBeenCalled();
  });

  it("prints the claimed job and reports success", async () => {
    nextJob.mockResolvedValue({ jobId: "job-1" });

    expect(await runOnce(deps())).toBe("printed");

    expect(fetchLabel).toHaveBeenCalledWith("job-1");
    expect(print).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(reportResult).toHaveBeenCalledWith("job-1", "printed");
  });

  it("reports a failure instead of retrying silently", async () => {
    nextJob.mockResolvedValue({ jobId: "job-1" });
    print.mockRejectedValue(new Error("paper out"));

    expect(await runOnce(deps())).toBe("failed");

    expect(reportResult).toHaveBeenCalledWith("job-1", "failed");
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("reconnects the printer after a failed print", async () => {
    nextJob.mockResolvedValue({ jobId: "job-1" });
    print.mockRejectedValue(new Error("disconnected"));

    await runOnce(deps());

    expect(reconnect).toHaveBeenCalled();
  });

  it("reports a failure when the label cannot be downloaded", async () => {
    nextJob.mockResolvedValue({ jobId: "job-1" });
    fetchLabel.mockRejectedValue(new Error("offline"));

    await runOnce(deps());

    expect(reportResult).toHaveBeenCalledWith("job-1", "failed");
  });

  it("lets an unpaired error through rather than reporting a print failure", async () => {
    nextJob.mockResolvedValue({ jobId: "job-1" });
    fetchLabel.mockRejectedValue(new UnauthorizedError());

    await expect(runOnce(deps())).rejects.toBeInstanceOf(UnauthorizedError);
    expect(reportResult).not.toHaveBeenCalled();
  });
});

describe("runLoop", () => {
  function times(count: number): () => boolean {
    let left = count;
    return () => left-- > 0;
  }

  it("keeps polling while it should continue", async () => {
    await runLoop(deps(), times(3));
    expect(nextJob).toHaveBeenCalledTimes(3);
  });

  it("backs off when printkit cannot be reached", async () => {
    nextJob.mockRejectedValue(new Error("network down"));

    await runLoop(deps(), times(3));

    const waits = sleep.mock.calls.map((call) => call[0] as number);
    expect(waits[1]).toBeGreaterThan(waits[0]);
    expect(waits[2]).toBeGreaterThan(waits[1]);
  });

  it("returns to the normal interval once printkit answers again", async () => {
    nextJob
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue(null);

    await runLoop(deps(), times(2));

    const waits = sleep.mock.calls.map((call) => call[0] as number);
    expect(waits[1]).toBeLessThan(waits[0]);
  });

  it("stops for good once the agent has been unpaired", async () => {
    nextJob.mockRejectedValue(new UnauthorizedError());

    await runLoop(deps(), times(5));

    expect(nextJob).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("Unpaired by printkit. Stopping.");
  });
});
