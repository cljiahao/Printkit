// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";

vi.mock("@/lib/bridge-mode", () => ({
  isBridgeModeEnabled: vi.fn().mockReturnValue(false),
  setBridgeModeEnabled: vi.fn(),
}));
vi.mock("./use-job-delivery", () => ({ useJobDelivery: vi.fn() }));
vi.mock("@/lib/niimbot-print", () => ({
  connectPrinter: vi.fn().mockResolvedValue({ deviceName: "B1" }),
  printLabel: vi.fn().mockResolvedValue(undefined),
  disconnectPrinter: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/label-image", () => ({
  fetchLabelCanvas: vi.fn(),
  fetchSampleLabelCanvas: vi.fn(),
}));
vi.mock("./actions", () => ({
  reportPrintResult: vi.fn().mockResolvedValue({ success: true }),
  logBridgeEvent: vi.fn().mockResolvedValue({ success: true }),
  claimBridgeJob: vi.fn(),
  bridgeHeartbeat: vi.fn().mockResolvedValue(undefined),
  ensureBridgePrinter: vi.fn().mockResolvedValue(undefined),
}));

import { isBridgeModeEnabled, setBridgeModeEnabled } from "@/lib/bridge-mode";
import {
  connectPrinter,
  printLabel,
  disconnectPrinter,
} from "@/lib/niimbot-print";
import { fetchLabelCanvas, fetchSampleLabelCanvas } from "@/lib/label-image";
import {
  reportPrintResult,
  logBridgeEvent,
  claimBridgeJob,
  bridgeHeartbeat,
  ensureBridgePrinter,
} from "./actions";
import { useJobDelivery } from "./use-job-delivery";
import { BridgePanel } from "./bridge-panel";

const ATTEMPT = "2026-10-08T00:00:00.123456+00:00";

function deliveredJob(): (jobId?: string) => void {
  const call = vi.mocked(useJobDelivery).mock.calls.at(-1);
  if (!call) throw new Error("useJobDelivery was never called");
  return call[2] as unknown as (jobId?: string) => void;
}

async function enableAndPair() {
  render(<BridgePanel vendorId="vendor-1" locationId="loc-1" />);
  fireEvent.click(screen.getByRole("switch"));
  fireEvent.click(screen.getByRole("button", { name: /pair printer/i }));
  await waitFor(() => {
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });
  await waitFor(() =>
    expect(claimBridgeJob).toHaveBeenCalledWith("loc-1", undefined),
  );
  await act(async () => {});
}

describe("BridgePanel", () => {
  beforeEach(() => {
    vi.mocked(isBridgeModeEnabled).mockReturnValue(false);
    vi.mocked(setBridgeModeEnabled).mockReset();
    vi.mocked(disconnectPrinter).mockReset().mockResolvedValue(undefined);
    vi.mocked(connectPrinter).mockReset();
    vi.mocked(connectPrinter).mockResolvedValue({ deviceName: "B1" } as never);
    vi.mocked(printLabel).mockReset();
    vi.mocked(printLabel).mockResolvedValue(undefined);
    vi.mocked(fetchLabelCanvas).mockReset();
    vi.mocked(fetchLabelCanvas).mockResolvedValue(
      document.createElement("canvas"),
    );
    vi.mocked(fetchSampleLabelCanvas).mockReset();
    vi.mocked(fetchSampleLabelCanvas).mockResolvedValue(
      document.createElement("canvas"),
    );
    vi.mocked(reportPrintResult).mockReset();
    vi.mocked(reportPrintResult).mockResolvedValue({ success: true });
    vi.mocked(logBridgeEvent).mockReset();
    vi.mocked(logBridgeEvent).mockResolvedValue({ success: true });
    vi.mocked(claimBridgeJob).mockReset();
    vi.mocked(claimBridgeJob).mockImplementation(async (_location, jobId) =>
      jobId ? { ok: true, jobId: "job-1", sentAt: ATTEMPT } : { ok: false },
    );
    vi.mocked(bridgeHeartbeat).mockReset().mockResolvedValue(undefined);
    vi.mocked(ensureBridgePrinter).mockReset().mockResolvedValue(undefined);
    vi.mocked(useJobDelivery).mockReset();
  });

  it("disconnects a pairing completed after unmount", async () => {
    let finish!: (client: Awaited<ReturnType<typeof connectPrinter>>) => void;
    vi.mocked(connectPrinter).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { unmount } = render(
      <BridgePanel vendorId="vendor-1" locationId="loc-1" />,
    );
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: /pair printer/i }));
    unmount();
    const client = { deviceName: "late" } as unknown as Awaited<
      ReturnType<typeof connectPrinter>
    >;
    await act(async () => finish(client));
    expect(disconnectPrinter).toHaveBeenCalledWith(client);
    expect(ensureBridgePrinter).not.toHaveBeenCalled();
  });

  it("disconnects a pairing completed after switching off", async () => {
    let finish!: (client: Awaited<ReturnType<typeof connectPrinter>>) => void;
    vi.mocked(connectPrinter).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<BridgePanel vendorId="vendor-1" locationId="loc-1" />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: /pair printer/i }));
    fireEvent.click(screen.getByRole("switch"));
    const client = { deviceName: "late" } as unknown as Awaited<
      ReturnType<typeof connectPrinter>
    >;
    await act(async () => finish(client));
    expect(disconnectPrinter).toHaveBeenCalledWith(client);
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });

  it("drains the backlog after pairing without another realtime event", async () => {
    vi.mocked(claimBridgeJob)
      .mockResolvedValueOnce({ ok: true, jobId: "first", sentAt: ATTEMPT })
      .mockResolvedValueOnce({ ok: true, jobId: "second", sentAt: ATTEMPT });
    await enableAndPair();
    await waitFor(() =>
      expect(reportPrintResult).toHaveBeenCalledWith(
        "second",
        "printed",
        ATTEMPT,
      ),
    );
    expect(printLabel).toHaveBeenCalledTimes(2);
  });

  it("serializes test labels with real jobs", async () => {
    await enableAndPair();
    let release!: () => void;
    vi.mocked(printLabel).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await act(async () => deliveredJob()("job-1"));
    fireEvent.click(screen.getByRole("button", { name: /print test/i }));
    expect(fetchSampleLabelCanvas).not.toHaveBeenCalled();
    await act(async () => release());
    await waitFor(() => expect(printLabel).toHaveBeenCalledTimes(2));
  });

  it("does not report physical failure when saving success rejects", async () => {
    await enableAndPair();
    vi.mocked(reportPrintResult).mockRejectedValueOnce(new Error("offline"));
    await act(async () => deliveredJob()("job-1"));
    expect(reportPrintResult).toHaveBeenCalledExactlyOnceWith(
      "job-1",
      "printed",
      ATTEMPT,
    );
  });

  it("does not print a downloaded label after switching off", async () => {
    await enableAndPair();
    let finish!: (canvas: HTMLCanvasElement) => void;
    vi.mocked(fetchLabelCanvas).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => deliveredJob()("job-1"));
    fireEvent.click(screen.getByRole("switch"));
    await act(async () => finish(document.createElement("canvas")));
    expect(printLabel).not.toHaveBeenCalled();
    expect(disconnectPrinter).toHaveBeenCalledTimes(1);
  });

  it("renders the Bridge mode toggle off by default", () => {
    render(<BridgePanel vendorId="vendor-1" locationId="loc-1" />);
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("persists enabling Bridge mode", () => {
    render(<BridgePanel vendorId="vendor-1" locationId="loc-1" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(setBridgeModeEnabled).toHaveBeenCalledWith(true);
  });

  it("shows a Pair printer button only once Bridge mode is enabled", () => {
    render(<BridgePanel vendorId="vendor-1" locationId="loc-1" />);
    expect(
      screen.queryByRole("button", { name: /pair printer/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));
    expect(
      screen.getByRole("button", { name: /pair printer/i }),
    ).toBeInTheDocument();
  });

  it("connects the printer and registers it when pairing", async () => {
    await enableAndPair();

    expect(connectPrinter).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(ensureBridgePrinter).toHaveBeenCalledWith("loc-1");
    });
    expect(logBridgeEvent).toHaveBeenCalledWith("printer_paired");
  });

  it("claims any job already waiting when pairing finishes", async () => {
    await enableAndPair();

    await waitFor(() => {
      expect(claimBridgeJob).toHaveBeenCalledWith("loc-1", undefined);
    });
  });

  it("beats the heartbeat while Bridge mode is on", async () => {
    render(<BridgePanel vendorId="vendor-1" locationId="loc-1" />);
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(bridgeHeartbeat).toHaveBeenCalledWith("loc-1");
    });
  });

  it("sends no heartbeat while Bridge mode is off", () => {
    render(<BridgePanel vendorId="vendor-1" locationId="loc-1" />);
    expect(bridgeHeartbeat).not.toHaveBeenCalled();
  });

  it("logs a disconnect when Bridge mode is toggled off", () => {
    render(<BridgePanel vendorId="vendor-1" locationId="loc-1" />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("switch"));

    expect(logBridgeEvent).toHaveBeenCalledWith("bridge_disconnected");
  });

  it("prints a test label at the booth's own size", async () => {
    await enableAndPair();
    fireEvent.click(screen.getByRole("button", { name: /print test/i }));

    await waitFor(() => {
      expect(fetchSampleLabelCanvas).toHaveBeenCalledWith("loc-1");
    });
    expect(printLabel).toHaveBeenCalled();
  });

  describe("auto-print via job delivery", () => {
    it("claims the job, prints the server-rendered label and reports success", async () => {
      await enableAndPair();
      vi.mocked(claimBridgeJob).mockClear();

      await act(async () => {
        deliveredJob()("job-7");
      });

      await waitFor(() => {
        expect(claimBridgeJob).toHaveBeenCalledWith("loc-1", "job-7");
      });
      expect(fetchLabelCanvas).toHaveBeenCalledWith("job-1");
      expect(printLabel).toHaveBeenCalled();
      expect(reportPrintResult).toHaveBeenCalledWith(
        "job-1",
        "printed",
        ATTEMPT,
      );
    });

    it("prints nothing when the claim fails, so two bridges cannot double-print", async () => {
      await enableAndPair();
      vi.mocked(printLabel).mockClear();
      vi.mocked(reportPrintResult).mockClear();
      vi.mocked(claimBridgeJob).mockResolvedValue({ ok: false });

      await act(async () => {
        deliveredJob()("job-7");
      });

      expect(printLabel).not.toHaveBeenCalled();
      expect(reportPrintResult).not.toHaveBeenCalled();
    });

    it("reports a failure when the label cannot be downloaded", async () => {
      await enableAndPair();
      vi.mocked(fetchLabelCanvas).mockRejectedValue(new Error("offline"));

      await act(async () => {
        deliveredJob()("job-7");
      });

      await waitFor(() => {
        expect(reportPrintResult).toHaveBeenCalledWith(
          "job-1",
          "failed",
          ATTEMPT,
        );
      });
    });

    it("reports a failure when the printer rejects the print", async () => {
      await enableAndPair();
      vi.mocked(printLabel).mockRejectedValue(new Error("paper out"));

      await act(async () => {
        deliveredJob()("job-7");
      });

      await waitFor(() => {
        expect(reportPrintResult).toHaveBeenCalledWith(
          "job-1",
          "failed",
          ATTEMPT,
        );
      });
    });

    it("serializes two jobs queued back to back", async () => {
      await enableAndPair();
      vi.mocked(printLabel).mockClear();

      let release = () => {};
      vi.mocked(printLabel).mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );

      await act(async () => {
        deliveredJob()("job-7");
        deliveredJob()("job-8");
      });

      expect(printLabel).toHaveBeenCalledTimes(1);

      await act(async () => {
        release();
      });

      await waitFor(() => {
        expect(printLabel).toHaveBeenCalledTimes(2);
      });
    });

    it("keeps printing later jobs after one fails", async () => {
      await enableAndPair();
      vi.mocked(printLabel).mockRejectedValueOnce(new Error("paper out"));
      vi.mocked(reportPrintResult).mockClear();

      await act(async () => {
        deliveredJob()("job-7");
      });
      await act(async () => {
        deliveredJob()("job-8");
      });

      await waitFor(() => {
        expect(reportPrintResult).toHaveBeenCalledWith(
          "job-1",
          "printed",
          ATTEMPT,
        );
      });
    });
  });
});
