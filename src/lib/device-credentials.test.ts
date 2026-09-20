import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertMock = vi.fn();
const deleteMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: () => ({
        upsert: upsertMock,
        delete: deleteMock,
      }),
    }),
}));

import {
  mintDeviceCredential,
  hashDeviceToken,
  revokeDeviceCredential,
} from "./device-credentials";

beforeEach(() => {
  upsertMock.mockReset().mockResolvedValue({ error: null });
  deleteMock.mockReset().mockReturnValue({
    eq: () => Promise.resolve({ error: null }),
  });
});

describe("hashDeviceToken", () => {
  it("is a stable sha256 hex digest", () => {
    const hash = hashDeviceToken("abc");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDeviceToken("abc")).toBe(hash);
    expect(hashDeviceToken("abd")).not.toBe(hash);
  });
});

describe("mintDeviceCredential", () => {
  it("returns a base64url token", async () => {
    const token = await mintDeviceCredential(
      "printer-1",
      "cloudprnt_url_token",
    );
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("stores only the hash, never the raw token", async () => {
    const token = await mintDeviceCredential(
      "printer-1",
      "cloudprnt_url_token",
    );

    const row = upsertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(row.token_hash).toBe(hashDeviceToken(token as string));
    expect(JSON.stringify(row)).not.toContain(token as string);
    expect(row.printer_id).toBe("printer-1");
    expect(row.kind).toBe("cloudprnt_url_token");
  });

  it("mints a different token each time and stamps the rotation", async () => {
    const first = await mintDeviceCredential("printer-1", "bridge_agent_token");
    const second = await mintDeviceCredential(
      "printer-1",
      "bridge_agent_token",
    );

    expect(first).not.toBe(second);
    const row = upsertMock.mock.calls[1][0] as Record<string, unknown>;
    expect(row.rotated_at).toEqual(expect.any(String));
  });

  it("returns null on a write error rather than throwing", async () => {
    upsertMock.mockResolvedValue({ error: { message: "boom" } });
    expect(
      await mintDeviceCredential("printer-1", "cloudprnt_url_token"),
    ).toBeNull();
  });
});

describe("revokeDeviceCredential", () => {
  it("deletes the printer's credential row", async () => {
    await revokeDeviceCredential("printer-1");
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the delete fails", async () => {
    deleteMock.mockReturnValue({
      eq: () => Promise.resolve({ error: { message: "boom" } }),
    });
    await expect(revokeDeviceCredential("printer-1")).resolves.toBeUndefined();
  });
});
