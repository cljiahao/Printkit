import { describe, it, expect, afterEach } from "vitest";
import { bearerOk, provisionBearerOk } from "./merqo-auth";

function reqWithAuth(header?: string) {
  return new Request("http://localhost/x", {
    headers: header ? { Authorization: header } : {},
  });
}

describe("bearerOk", () => {
  afterEach(() => {
    delete process.env.MERQO_METRICS_SECRET;
  });

  it("rejects when MERQO_METRICS_SECRET is unset", () => {
    delete process.env.MERQO_METRICS_SECRET;
    expect(bearerOk(reqWithAuth("Bearer anything"))).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    process.env.MERQO_METRICS_SECRET = "s1";
    expect(bearerOk(reqWithAuth())).toBe(false);
  });

  it("rejects a wrong secret", () => {
    process.env.MERQO_METRICS_SECRET = "s1";
    expect(bearerOk(reqWithAuth("Bearer wrong"))).toBe(false);
  });

  it("accepts the correct secret", () => {
    process.env.MERQO_METRICS_SECRET = "s1";
    expect(bearerOk(reqWithAuth("Bearer s1"))).toBe(true);
  });
});

describe("provisionBearerOk", () => {
  afterEach(() => {
    delete process.env.MERQO_PROVISION_SECRET;
  });

  it("rejects when MERQO_PROVISION_SECRET is unset", () => {
    delete process.env.MERQO_PROVISION_SECRET;
    expect(provisionBearerOk(reqWithAuth("Bearer anything"))).toBe(false);
  });

  it("accepts the correct secret, independent of MERQO_METRICS_SECRET", () => {
    process.env.MERQO_PROVISION_SECRET = "p1";
    expect(provisionBearerOk(reqWithAuth("Bearer p1"))).toBe(true);
  });
});

describe("bearerOk / provisionBearerOk cross-rejection", () => {
  afterEach(() => {
    delete process.env.MERQO_METRICS_SECRET;
    delete process.env.MERQO_PROVISION_SECRET;
  });

  it("each helper rejects the other's secret when both are set", () => {
    process.env.MERQO_METRICS_SECRET = "m1";
    process.env.MERQO_PROVISION_SECRET = "p1";
    expect(provisionBearerOk(reqWithAuth("Bearer m1"))).toBe(false);
    expect(bearerOk(reqWithAuth("Bearer p1"))).toBe(false);
  });
});
