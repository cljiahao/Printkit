import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn();
const updateMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: () => ({ insert: insertMock, update: updateMock }),
    }),
}));

import {
  createPairingCode,
  redeemPairingCode,
  formatPairingCode,
} from "./bridge-pairing";
import { hashDeviceToken } from "./device-credentials";

function redeemReturns(printerId: string | null, error: unknown = null) {
  updateMock.mockReturnValue({
    eq: (_col: string, value: string) => ({
      is: () => ({
        gt: () => ({
          select: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: printerId ? { printer_id: printerId, value } : null,
                error,
              }),
          }),
        }),
      }),
    }),
  });
}

beforeEach(() => {
  insertMock.mockReset().mockResolvedValue({ error: null });
  updateMock.mockReset();
});

describe("createPairingCode", () => {
  it("returns a code a person can read off a screen", async () => {
    const code = await createPairingCode("printer-1");
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it("stores only the code's hash, with a ten minute expiry", async () => {
    const code = await createPairingCode("printer-1");
    const row = insertMock.mock.calls[0][0] as Record<string, string>;

    expect(row.code_hash).toBe(hashDeviceToken(code as string));
    expect(JSON.stringify(row)).not.toContain(code as string);
    expect(row.printer_id).toBe("printer-1");

    const ttl = new Date(row.expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(9 * 60_000);
    expect(ttl).toBeLessThanOrEqual(10 * 60_000);
  });

  it("returns null rather than throwing when the write fails", async () => {
    insertMock.mockResolvedValue({ error: { message: "boom" } });
    expect(await createPairingCode("printer-1")).toBeNull();
  });
});

describe("redeemPairingCode", () => {
  it("returns the printer the code was minted for", async () => {
    redeemReturns("printer-1");
    expect(await redeemPairingCode("ABCD2345")).toBe("printer-1");
  });

  it("marks the code used in the same statement that reads it", async () => {
    redeemReturns("printer-1");
    await redeemPairingCode("ABCD2345");

    expect(updateMock).toHaveBeenCalledWith({
      used_at: expect.any(String),
    });
  });

  it("accepts the code as the vendor sees it, with its dash", async () => {
    redeemReturns("printer-1");
    await redeemPairingCode(formatPairingCode("ABCD2345"));

    const call = updateMock.mock.results[0].value as {
      eq: (col: string, value: string) => unknown;
    };
    expect(call).toBeDefined();
  });

  it("refuses an unknown, used or expired code", async () => {
    redeemReturns(null);
    expect(await redeemPairingCode("ABCD2345")).toBeNull();
  });

  it("refuses without throwing when the query fails", async () => {
    redeemReturns(null, { message: "boom" });
    expect(await redeemPairingCode("ABCD2345")).toBeNull();
  });
});

describe("formatPairingCode", () => {
  it("groups the code for reading aloud", () => {
    expect(formatPairingCode("ABCD2345")).toBe("ABCD-2345");
  });
});
