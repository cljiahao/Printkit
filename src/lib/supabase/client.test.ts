import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("@supabase/ssr");

import { createClient } from "./client";
import * as ssrModule from "@supabase/ssr";

const createBrowserClient = vi.mocked(ssrModule.createBrowserClient);

describe("createClient — shared-session cookie domain", () => {
  beforeEach(() => {
    createBrowserClient.mockReturnValue({});
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
    createBrowserClient.mockClear();
  });

  it("scopes the auth cookie to .merqo.io when NEXT_PUBLIC_AUTH_COOKIE_DOMAIN is set", () => {
    process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = ".merqo.io";
    createClient();
    const call = createBrowserClient.mock.calls[0];
    expect(call).toBeDefined();
    const options = call?.[2];
    expect(options?.cookieOptions).toEqual({ domain: ".merqo.io" });
  });

  it("omits cookieOptions.domain when NEXT_PUBLIC_AUTH_COOKIE_DOMAIN is unset (dev/preview)", () => {
    createClient();
    const call = createBrowserClient.mock.calls[0];
    expect(call).toBeDefined();
    const options = call?.[2];
    expect(options?.cookieOptions).toBeUndefined();
  });
});
