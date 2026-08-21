import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashApiKey } from "./kit-auth";

const { maybeSingleMock } = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => maybeSingleMock(),
          }),
        }),
      }),
    }),
}));

import { verifyKitAuth } from "./kit-auth";

function requestWith(authorization: string | null) {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return new Request("https://printkit.test/api/v1/print-jobs", { headers });
}

describe("verifyKitAuth", () => {
  beforeEach(() => maybeSingleMock.mockReset());

  it("returns null with no authorization header", async () => {
    expect(await verifyKitAuth(requestWith(null))).toBeNull();
  });

  it("returns null when the kit_slug is unknown", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    expect(await verifyKitAuth(requestWith("Bearer qkit:secret"))).toBeNull();
  });

  it("returns null when the secret doesn't match", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { secret_hash: hashApiKey("correct-secret") },
      error: null,
    });
    expect(
      await verifyKitAuth(requestWith("Bearer qkit:wrong-secret")),
    ).toBeNull();
  });

  it("returns the kitSlug when the secret matches", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { secret_hash: hashApiKey("correct-secret") },
      error: null,
    });
    expect(
      await verifyKitAuth(requestWith("Bearer qkit:correct-secret")),
    ).toEqual({ kitSlug: "qkit" });
  });
});
