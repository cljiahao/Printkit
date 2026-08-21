import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notifyQkitPrintStatus } from "./qkit-client";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

describe("notifyQkitPrintStatus", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("does nothing (no throw) when QKIT_CALLBACK_SECRET is unset", async () => {
    delete process.env.QKIT_CALLBACK_SECRET;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      notifyQkitPrintStatus("order-1", "failed"),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing (no throw) when NEXT_PUBLIC_QKIT_URL is unset", async () => {
    process.env.QKIT_CALLBACK_SECRET = "shared-secret";
    delete process.env.NEXT_PUBLIC_QKIT_URL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      notifyQkitPrintStatus("order-1", "failed"),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs a plain (no kit_slug prefix) bearer token and the order id/status", async () => {
    process.env.QKIT_CALLBACK_SECRET = "shared-secret";
    process.env.NEXT_PUBLIC_QKIT_URL = "https://qkit.test";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await notifyQkitPrintStatus("order-1", "failed");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://qkit.test/api/printkit/print-status");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer shared-secret");
    expect(JSON.parse(init.body)).toEqual({
      order_id: "order-1",
      status: "failed",
    });
  });

  it("never throws when the fetch itself rejects", async () => {
    process.env.QKIT_CALLBACK_SECRET = "shared-secret";
    process.env.NEXT_PUBLIC_QKIT_URL = "https://qkit.test";
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      notifyQkitPrintStatus("order-1", "printed"),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never throws on a non-2xx response", async () => {
    process.env.QKIT_CALLBACK_SECRET = "shared-secret";
    process.env.NEXT_PUBLIC_QKIT_URL = "https://qkit.test";
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      notifyQkitPrintStatus("order-1", "printed"),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
