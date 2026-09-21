import { describe, it, expect, afterEach } from "vitest";
import { publicSiteUrl } from "./site-url";

const KEYS = [
  "PRINTKIT_PUBLIC_URL",
  "VERCEL_ENV",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
] as const;
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

function clear() {
  for (const key of KEYS) delete process.env[key];
}

describe("publicSiteUrl", () => {
  it("prefers the configured origin and drops a trailing slash", () => {
    clear();
    process.env.PRINTKIT_PUBLIC_URL = "https://printkit.merqo.io/";
    process.env.VERCEL_URL = "preview.vercel.app";

    expect(publicSiteUrl()).toBe("https://printkit.merqo.io");
  });

  it("uses the production domain in production", () => {
    clear();
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "printkit.merqo.io";
    process.env.VERCEL_URL = "printkit-abc.vercel.app";

    expect(publicSiteUrl()).toBe("https://printkit.merqo.io");
  });

  it("uses the deployment host outside production", () => {
    clear();
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "printkit-abc.vercel.app";

    expect(publicSiteUrl()).toBe("https://printkit-abc.vercel.app");
  });

  it("answers null rather than a relative URL when nothing is set", () => {
    clear();
    expect(publicSiteUrl()).toBeNull();
  });
});
