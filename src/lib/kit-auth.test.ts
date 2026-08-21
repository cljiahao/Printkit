import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashApiKey } from "./kit-auth";

const { maybeSingleMock, createServiceClientMock } = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
  createServiceClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));

beforeEach(async () => {
  maybeSingleMock.mockReset();
  createServiceClientMock.mockReset().mockResolvedValue({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
    }),
  });
});

function req(authorization?: string) {
  return new Request("http://localhost/api/v1/checkout", {
    headers: authorization ? { authorization } : {},
  });
}

describe("hashApiKey", () => {
  it("is deterministic and hex-encoded", () => {
    const h = hashApiKey("s3cret");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey("s3cret")).toBe(h);
  });
  it("differs for different secrets", () => {
    expect(hashApiKey("a")).not.toBe(hashApiKey("b"));
  });
});

describe("verifyKitAuth", () => {
  it("returns null with no Authorization header", async () => {
    const { verifyKitAuth } = await import("./kit-auth");
    expect(await verifyKitAuth(req())).toBeNull();
  });

  it("returns null for a malformed bearer token (no kit_slug:secret split)", async () => {
    const { verifyKitAuth } = await import("./kit-auth");
    expect(await verifyKitAuth(req("Bearer justasecret"))).toBeNull();
  });

  it("returns null when the kit_slug is unknown", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { verifyKitAuth } = await import("./kit-auth");
    expect(await verifyKitAuth(req("Bearer qkit:s3cret"))).toBeNull();
  });

  it("returns null when the secret hash does not match", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { secret_hash: hashApiKey("different-secret") },
      error: null,
    });
    const { verifyKitAuth } = await import("./kit-auth");
    expect(await verifyKitAuth(req("Bearer qkit:s3cret"))).toBeNull();
  });

  it("returns the kit slug when the secret hash matches", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { secret_hash: hashApiKey("s3cret") },
      error: null,
    });
    const { verifyKitAuth } = await import("./kit-auth");
    expect(await verifyKitAuth(req("Bearer qkit:s3cret"))).toEqual({
      kitSlug: "qkit",
    });
  });
});
