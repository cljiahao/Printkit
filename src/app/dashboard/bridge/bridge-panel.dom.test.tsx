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
vi.mock("./use-bridge-presence", () => ({ useBridgePresence: vi.fn() }));
vi.mock("@/lib/niimbot-print", () => ({
  connectPrinter: vi.fn().mockResolvedValue({ deviceName: "B1" }),
  printLabel: vi.fn().mockResolvedValue(undefined),
  disconnectPrinter: vi.fn().mockResolvedValue(undefined),
}));
const labelRendererMock = vi
  .fn()
  .mockReturnValue(document.createElement("canvas"));
vi.mock("@/lib/print-job-renderers", () => ({
  getJobRenderer: (jobType: string) =>
    jobType === "label" ? labelRendererMock : null,
}));
vi.mock("./actions", () => ({
  reportPrintResult: vi.fn().mockResolvedValue({ success: true }),
  logBridgeEvent: vi.fn().mockResolvedValue({ success: true }),
}));

import { isBridgeModeEnabled, setBridgeModeEnabled } from "@/lib/bridge-mode";
import { connectPrinter, printLabel } from "@/lib/niimbot-print";
import { reportPrintResult, logBridgeEvent } from "./actions";
import { useJobDelivery } from "./use-job-delivery";
import { BridgePanel } from "./bridge-panel";

describe("BridgePanel", () => {
  beforeEach(() => {
    vi.mocked(isBridgeModeEnabled).mockReturnValue(false);
    vi.mocked(setBridgeModeEnabled).mockClear();
    vi.mocked(connectPrinter).mockClear();
    vi.mocked(connectPrinter).mockResolvedValue({
      deviceName: "B1",
    } as never);
    vi.mocked(printLabel).mockClear();
    vi.mocked(printLabel).mockResolvedValue(undefined);
    labelRendererMock.mockClear();
    labelRendererMock.mockReturnValue(document.createElement("canvas"));
    vi.mocked(reportPrintResult).mockClear();
    vi.mocked(reportPrintResult).mockResolvedValue({ success: true });
    vi.mocked(logBridgeEvent).mockClear();
    vi.mocked(logBridgeEvent).mockResolvedValue({ success: true });
    vi.mocked(useJobDelivery).mockClear();
  });

  it("renders the Bridge mode toggle off by default", () => {
    render(<BridgePanel vendorId="vendor-1" locationId="loc-1" />);
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("persists enabling Bridge mode via setBridgeModeEnabled", () => {
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

  it("connects the printer when Pair printer is clicked", async () => {
    render(<BridgePanel vendorId="vendor-1" locationId="loc-1" />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: /pair printer/i }));

    await waitFor(() => expect(connectPrinter).toHaveBeenCalled());
    expect(await screen.findByText(/connected/i)).toBeInTheDocument();
  });

  it("shows a Print test button once paired", async () => {
    render(<BridgePanel vendorId="vendor-1" locationId="loc-1" />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: /pair printer/i }));

    expect(
      await screen.findByRole("button", { name: /print test/i }),
    ).toBeInTheDocument();
  });

  it("logs a printer_paired admin_audit event once pairing succeeds", async () => {
    render(<BridgePanel vendorId="vendor-1" locationId="loc-1" />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: /pair printer/i }));

    await waitFor(() =>
      expect(logBridgeEvent).toHaveBeenCalledWith("printer_paired"),
    );
  });

  it("logs a bridge_disconnected admin_audit event when Bridge mode is toggled off", () => {
    render(<BridgePanel vendorId="vendor-1" locationId="loc-1" />);
    fireEvent.click(screen.getByRole("switch")); // on
    fireEvent.click(screen.getByRole("switch")); // off

    expect(logBridgeEvent).toHaveBeenCalledWith("bridge_disconnected");
  });

  it("does not log bridge_disconnected on the initial enable", () => {
    render(<BridgePanel vendorId="vendor-1" locationId="loc-1" />);
    fireEvent.click(screen.getByRole("switch")); // on

    expect(logBridgeEvent).not.toHaveBeenCalledWith("bridge_disconnected");
  });

  describe("auto-print via job delivery", () => {
    async function pair() {
      render(<BridgePanel vendorId="vendor-1" locationId="loc-1" />);
      fireEvent.click(screen.getByRole("switch"));
      fireEvent.click(screen.getByRole("button", { name: /pair printer/i }));
      await waitFor(() => expect(connectPrinter).toHaveBeenCalled());
    }

    function deliveredJob() {
      const call = vi.mocked(useJobDelivery).mock.calls.at(-1);
      if (!call) throw new Error("useJobDelivery was never called");
      // index 2: (vendorId, locationId, onJobQueued)
      return call[2];
    }

    it("prints the job's real payload, not just its id", async () => {
      await pair();
      const onJobQueued = deliveredJob();

      await act(async () => {
        onJobQueued(
          "job-uuid-1",
          { customer_name: "Ada Lovelace", order_number: "0042" },
          "label",
        );
      });

      await waitFor(() =>
        expect(labelRendererMock).toHaveBeenCalledWith({
          customer_name: "Ada Lovelace",
          order_number: "0042",
        }),
      );
      expect(reportPrintResult).toHaveBeenCalledWith("job-uuid-1", "printed");
    });

    it("reports failure and never prints when the job_type has no renderer", async () => {
      await pair();
      const onJobQueued = deliveredJob();

      await act(async () => {
        onJobQueued("job-uuid-2", { customer_name: "Ada" }, "receipt");
      });

      await waitFor(() =>
        expect(reportPrintResult).toHaveBeenCalledWith("job-uuid-2", "failed"),
      );
      expect(labelRendererMock).not.toHaveBeenCalled();
      expect(printLabel).not.toHaveBeenCalled();
    });

    it("serializes two jobs queued back to back so their prints don't overlap", async () => {
      await pair();
      const onJobQueued = deliveredJob();

      const order: string[] = [];
      let resolveFirst: () => void = () => {};
      vi.mocked(printLabel).mockImplementation(async () => {
        if (order.length === 0) {
          order.push("first-start");
          await new Promise<void>((resolve) => {
            resolveFirst = resolve;
          });
          order.push("first-end");
        } else {
          order.push("second-start");
        }
      });

      act(() => {
        onJobQueued(
          "job-1",
          { customer_name: "A", order_number: "1" },
          "label",
        );
        onJobQueued(
          "job-2",
          { customer_name: "B", order_number: "2" },
          "label",
        );
      });

      await waitFor(() => expect(order).toContain("first-start"));
      // The second job's printLabel must not have started while the first
      // is still in-flight.
      expect(order).not.toContain("second-start");

      await act(async () => {
        resolveFirst();
      });

      await waitFor(() => expect(order).toContain("second-start"));
      expect(order).toEqual(["first-start", "first-end", "second-start"]);
    });

    it("keeps printing later jobs after an earlier one fails", async () => {
      await pair();
      const onJobQueued = deliveredJob();

      vi.mocked(printLabel)
        .mockRejectedValueOnce(new Error("jam"))
        .mockResolvedValueOnce(undefined);

      await act(async () => {
        onJobQueued(
          "job-1",
          { customer_name: "A", order_number: "1" },
          "label",
        );
      });
      await waitFor(() =>
        expect(reportPrintResult).toHaveBeenCalledWith("job-1", "failed"),
      );

      await act(async () => {
        onJobQueued(
          "job-2",
          { customer_name: "B", order_number: "2" },
          "label",
        );
      });
      await waitFor(() =>
        expect(reportPrintResult).toHaveBeenCalledWith("job-2", "printed"),
      );
    });

    it("keeps advancing the queue even if reportPrintResult unexpectedly rejects", async () => {
      await pair();
      const onJobQueued = deliveredJob();

      // Simulates an error outside doPrintJob's own try/catch (e.g. the
      // Server Action call itself throwing) — the queue must not wedge.
      vi.mocked(reportPrintResult).mockRejectedValue(new Error("network"));

      await act(async () => {
        onJobQueued(
          "job-1",
          { customer_name: "A", order_number: "1" },
          "label",
        );
      });

      vi.mocked(reportPrintResult).mockResolvedValue({ success: true });
      await act(async () => {
        onJobQueued(
          "job-2",
          { customer_name: "B", order_number: "2" },
          "label",
        );
      });

      await waitFor(() => expect(printLabel).toHaveBeenCalledTimes(2));
    });
  });
});
