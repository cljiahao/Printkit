import { describe, it, expect, vi, afterEach } from "vitest";

const { createServerClient, cookies } = vi.hoisted(() => ({
  createServerClient: vi.fn().mockReturnValue({}),
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("next/headers", () => ({ cookies }));

import { createServerClient as createOurServerClient } from "./server";

describe("createServerClient — shared-session cookie domain", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
    createServerClient.mockClear();
  });

  it("scopes the auth cookie to .merqo.io when NEXT_PUBLIC_AUTH_COOKIE_DOMAIN is set", async () => {
    process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = ".merqo.io";
    await createOurServerClient();
    const options = createServerClient.mock.calls[0][2];
    expect(options.cookieOptions).toEqual({ domain: ".merqo.io" });
  });

  it("omits cookieOptions.domain when NEXT_PUBLIC_AUTH_COOKIE_DOMAIN is unset", async () => {
    await createOurServerClient();
    const options = createServerClient.mock.calls[0][2];
    expect(options.cookieOptions).toBeUndefined();
  });
});
