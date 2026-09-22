// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VirtualPrinterPanel } from "./virtual-printer-panel";

const startVirtualPrinterMock = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({
  startVirtualPrinter: (...args: unknown[]) => startVirtualPrinterMock(...args),
}));

const toastErrorMock = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}));

const LOCATIONS = [{ id: "loc-1", label: "Kopitiam Cart" }];

function mockFetchSequence(jobReady: boolean) {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });

      if (init?.method === "POST") {
        return new Response(
          JSON.stringify(
            jobReady
              ? { jobReady: true, jobToken: "job-1", mediaTypes: ["image/png"] }
              : { jobReady: false },
          ),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (init?.method === "DELETE") return new Response("{}");
      return new Response(new Blob([new Uint8Array([1, 2, 3])]));
    },
  );

  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  startVirtualPrinterMock.mockReset().mockResolvedValue({
    ok: true,
    token: "tok",
    printerId: "printer-1",
  });
  toastErrorMock.mockReset();
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:label"),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("VirtualPrinterPanel", () => {
  it("waits for a job once started", async () => {
    mockFetchSequence(false);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<VirtualPrinterPanel locations={LOCATIONS} />);
    await user.click(screen.getByRole("button", { name: /start virtual/i }));

    expect(await screen.findByText(/waiting for a job/i)).toBeInTheDocument();
  });

  it("shows the label it received and confirms the job", async () => {
    const calls = mockFetchSequence(true);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<VirtualPrinterPanel locations={LOCATIONS} />);
    await user.click(screen.getByRole("button", { name: /start virtual/i }));

    await vi.advanceTimersByTimeAsync(3100);

    await waitFor(() => {
      expect(screen.getByAltText(/label for job job-1/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(calls.some((call) => call.method === "DELETE")).toBe(true);
    });
  });

  it("reports an error instead of starting", async () => {
    startVirtualPrinterMock.mockResolvedValue({
      ok: false,
      error: "That booth already has a real printer set up.",
    });
    mockFetchSequence(false);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<VirtualPrinterPanel locations={LOCATIONS} />);
    await user.click(screen.getByRole("button", { name: /start virtual/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "That booth already has a real printer set up.",
      );
    });
  });
});
