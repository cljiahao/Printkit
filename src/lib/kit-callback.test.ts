const ATTEMPT_AT = "2026-10-08T01:00:00.123456+00:00";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const maybeSingleMock = vi.fn();
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({ from: () => ({ select: selectMock }) }),
}));

import { notifyKitPrintStatus } from "./kit-callback";

const originalFetch = global.fetch;

describe("notifyKitPrintStatus", () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("does nothing (no throw) when the kit_api_keys lookup errors", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      notifyKitPrintStatus("qkit", "order-1", "failed", ATTEMPT_AT),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing (no throw) when the kit has no row at all", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      notifyKitPrintStatus("unconfigured-kit", "order-1", "failed", ATTEMPT_AT),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing (no throw) when callback_url is set but callback_secret is null", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        callback_url: "https://qkit.test/api/printkit/print-status",
        callback_secret: null,
      },
      error: null,
    });
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await notifyKitPrintStatus("qkit", "order-1", "failed", ATTEMPT_AT);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing (no throw) when callback_secret is set but callback_url is null", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { callback_url: null, callback_secret: "shared-secret" },
      error: null,
    });
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await notifyKitPrintStatus("qkit", "order-1", "failed", ATTEMPT_AT);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs the configured kit's callback_url with a bearer token and the source_ref/status", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        callback_url: "https://qkit.test/api/printkit/print-status",
        callback_secret: "shared-secret",
      },
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await notifyKitPrintStatus("qkit", "order-1", "failed", ATTEMPT_AT);

    expect(eqMock).toHaveBeenCalledWith("kit_slug", "qkit");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://qkit.test/api/printkit/print-status");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer shared-secret");
    expect(JSON.parse(init.body)).toEqual({
      order_id: "order-1",
      status: "failed",
      attempt_at: "2026-10-08T01:00:00.123456Z",
    });
  });

  it("never throws when the fetch itself rejects", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        callback_url: "https://qkit.test/api/printkit/print-status",
        callback_secret: "shared-secret",
      },
      error: null,
    });
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      notifyKitPrintStatus("qkit", "order-1", "printed", ATTEMPT_AT),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never throws on a non-2xx response", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        callback_url: "https://qkit.test/api/printkit/print-status",
        callback_secret: "shared-secret",
      },
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      notifyKitPrintStatus("qkit", "order-1", "printed", ATTEMPT_AT),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it("contains rejected callback configuration lookups", async () => {
  maybeSingleMock.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(
    notifyKitPrintStatus("qkit", "order-1", "failed", ATTEMPT_AT),
  ).resolves.toBeUndefined();
});

it.each([
  ["2026-10-08T01:00:00.123456+00:00", "2026-10-08T01:00:00.123456Z"],
  ["2026-10-08T01:00:00.123456Z", "2026-10-08T01:00:00.123456Z"],
  ["2026-10-08T01:00:00.123+00:00", "2026-10-08T01:00:00.123000Z"],
  ["2026-10-08T01:00:00Z", "2026-10-08T01:00:00.000000Z"],
])("preserves UTC database attempt precision %s", async (input, expected) => {
  maybeSingleMock.mockResolvedValue({
    data: {
      callback_url: "https://qkit.test/api/printkit/print-status",
      callback_secret: "shared-secret",
    },
    error: null,
  });
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  global.fetch = fetchMock as unknown as typeof fetch;
  try {
    await notifyKitPrintStatus("qkit", "order-1", "printed", input);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).attempt_at).toBe(
      expected,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
it.each([
  "",
  "not-a-timestamp",
  "2026-10-08T01:00:00.123456+08:00",
  "2026-02-30T01:00:00.123456Z",
  "2026-10-08T01:00:00.1234567Z",
])("skips unsafe or unsupported attempt identity %j", async (input) => {
  const fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  try {
    await expect(
      notifyKitPrintStatus("qkit", "order-1", "failed", input),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    global.fetch = originalFetch;
  }
});
